import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendRequest } from "../../src/http/client.js";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/json") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: 7 }));
      return;
    }
    if (req.url === "/text") {
      res.end("hello");
      return;
    }
    if (req.url === "/echo") {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ method: req.method, body: data }));
      });
      return;
    }
    if (req.url === "/redirect") {
      res.statusCode = 302;
      res.setHeader("location", "/json");
      res.end();
      return;
    }
    if (req.url === "/slow") {
      setTimeout(() => res.end("late"), 500);
      return;
    }
    if (req.url === "/big") {
      res.end("x".repeat(2000));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
);

describe("sendRequest", () => {
  it("returns the status and a parsed JSON body", async () => {
    const result = await sendRequest({ method: "GET", url: `${base}/json` });
    expect(result).toEqual({ status: 200, body: { id: 7 } });
  });

  it("returns plain text when the body is not JSON", async () => {
    const result = await sendRequest({ method: "GET", url: `${base}/text` });
    expect(result.body).toBe("hello");
  });

  it("sends the method and a JSON body, including QUERY", async () => {
    const result = await sendRequest({
      method: "QUERY",
      url: `${base}/echo`,
      body: { q: "a" },
    });
    expect(result.body).toEqual({ method: "QUERY", body: '{"q":"a"}' });
  });

  it("returns error statuses instead of throwing", async () => {
    const result = await sendRequest({ method: "GET", url: `${base}/missing` });
    expect(result).toEqual({ status: 404, body: null });
  });

  it("does not follow redirects", async () => {
    const result = await sendRequest({ method: "GET", url: `${base}/redirect` });
    expect(result.status).toBe(302);
  });

  it("times out slow responses", async () => {
    await expect(
      sendRequest({ method: "GET", url: `${base}/slow`, timeoutMs: 50 }),
    ).rejects.toThrow("timed out");
  });

  it("stops reading oversized responses", async () => {
    await expect(
      sendRequest({ method: "GET", url: `${base}/big`, maxBytes: 100 }),
    ).rejects.toThrow("larger than");
  });

  it("rejects URLs that are not http or https", async () => {
    await expect(
      sendRequest({ method: "GET", url: "file:///etc/passwd" }),
    ).rejects.toThrow("Unsupported protocol");
  });

  it("explains plainly when the server cannot be reached", async () => {
    await expect(
      sendRequest({ method: "GET", url: "http://127.0.0.1:1/" }),
    ).rejects.toThrow("Could not connect");
  });
});