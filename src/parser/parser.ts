import type { HttpMethod, Scenario, Step } from "../ast/types.js";

const METHODS: HttpMethod[] = [
  "GET", "POST", "PUT", "PATCH", "DELETE", "QUERY", "HEAD", "OPTIONS",
];

function isMethod(word: string): word is HttpMethod {
  return (METHODS as string[]).includes(word);
}

/** Converts raw text such as `200` or `true` into a typed value. */
function parseValue(raw: string): string | number | boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw.replace(/^"(.*)"$/, "$1"); // strip surrounding quotes
}

/** Turns the text of a `.scenario` file into scenarios. */
export function parse(text: string): Scenario[] {
  const scenarios: Scenario[] = [];
  let scenario: Scenario | undefined;
  let step: Step | undefined;
  let inExpect = false;

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = rawLine.trim();

    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("scenario ")) {
      const name = trimmed.slice("scenario ".length).replace(/^"(.*)"$/, "$1");
      scenario = { name, steps: [], line };
      scenarios.push(scenario);
      step = undefined;
      inExpect = false;
      continue;
    }

    const request = trimmed.match(/^(\w+)\s+(\S+)$/);
    const method = request?.[1].toUpperCase();
    if (request && method && isMethod(method)) {
      if (!scenario) throw new Error(`Line ${line}: request before any scenario`);
      step = { method, path: request[2], expect: [], line };
      scenario.steps.push(step);
      inExpect = false;
      continue;
    }

    if (trimmed === "expect:") {
      inExpect = true;
      continue;
    }

    if (inExpect && step) {
      const colon = trimmed.indexOf(":");
      if (colon > 0) {
        step.expect.push({
          target: trimmed.slice(0, colon).trim(),
          value: parseValue(trimmed.slice(colon + 1).trim()),
          line,
        });
        continue;
      }
    }

    throw new Error(`Line ${line}: cannot understand "${trimmed}"`);
  }

  return scenarios;
}