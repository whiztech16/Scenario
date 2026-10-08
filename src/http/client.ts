import type { HttpMethod } from "../ast/types.ts";

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  body?: unknown;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

/** An error with a message that is safe and clear to show to the user. */
export class HttpClientError extends Error {}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/** Reads the response body, stopping if it grows past `maxBytes`. */
async function readLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpClientError(`Response is larger than ${maxBytes} bytes. Stopped reading.`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/** Parses JSON when possible; otherwise returns the raw text. */
function parseBody(text: string): unknown {
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Sends one HTTP request and returns its status and body. */
export async function sendRequest(request: HttpRequest): Promise<HttpResponse> {
  const {
    method,
    url,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
  } = request;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new HttpClientError(`Invalid URL: ${url}`);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new HttpClientError(`Unsupported protocol "${target.protocol}". Use http or https.`);
  }

  try {
    const response = await fetch(target, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual", // report 3xx as-is; never follow to another host
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await readLimited(response, maxBytes);
    return { status: response.status, body: parseBody(text) };
  } catch (error) {
    if (error instanceof HttpClientError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new HttpClientError(`Request timed out after ${timeoutMs} ms: ${method} ${target.origin}`);
    }
    throw new HttpClientError(`Could not connect to ${target.origin}. Is your server running?`);
  }
}