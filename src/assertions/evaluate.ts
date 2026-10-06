import type { Expectation } from "../ast/types.js";

/** The parts of an HTTP response that checks can look at. */
export interface ResponseData {
  status: number;
  body: unknown;
}

export interface CheckResult {
  passed: boolean;
  target: string;
  expected: Expectation["value"];
  actual: unknown;
  line: number;
}

/** Finds the real value for a target such as `status` or `body.user.name`. */
function getActual(target: string, response: ResponseData): unknown {
  if (target === "status") return response.status;
  if (target === "body") return response.body;

  if (target.startsWith("body.")) {
    let current: unknown = response.body;
    for (const key of target.slice("body.".length).split(".")) {
      if (typeof current !== "object" || current === null) return undefined;
      // Own properties only, so keys like `constructor` are never read.
      if (!Object.hasOwn(current, key)) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  return undefined;
}

/** Checks one expectation against a response. */
export function evaluate(expectation: Expectation, response: ResponseData): CheckResult {
  const actual = getActual(expectation.target, response);
  return {
    passed: actual === expectation.value,
    target: expectation.target,
    expected: expectation.value,
    actual,
    line: expectation.line,
  };
}