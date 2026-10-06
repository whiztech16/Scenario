import { describe, it, expect } from "vitest";
import { evaluate } from "../../src/assertions/evaluate.js";

const response = { status: 201, body: { id: 7, user: { name: "Ada" } } };

describe("evaluate", () => {
  it("passes when the status matches", () => {
    const result = evaluate({ target: "status", value: 201, line: 5 }, response);
    expect(result.passed).toBe(true);
  });

  it("fails and reports the actual value when the status differs", () => {
    const result = evaluate({ target: "status", value: 200, line: 5 }, response);
    expect(result).toMatchObject({ passed: false, expected: 200, actual: 201 });
  });

  it("reads nested body values", () => {
    const result = evaluate({ target: "body.user.name", value: "Ada", line: 6 }, response);
    expect(result.passed).toBe(true);
  });

  it("fails when the body field does not exist", () => {
    const result = evaluate({ target: "body.missing", value: 1, line: 6 }, response);
    expect(result).toMatchObject({ passed: false, actual: undefined });
  });

  it("does not read inherited properties", () => {
    const result = evaluate({ target: "body.constructor", value: "x", line: 6 }, response);
    expect(result.actual).toBeUndefined();
  });

  it.each([200, 201, 204, 400, 401, 404, 500])(
    "passes when the expected status %i matches the response",
    (status) => {
      const result = evaluate({ target: "status", value: status, line: 1 }, { status, body: null });
      expect(result.passed).toBe(true);
    },
  );

  it("fails when an error status is not what was expected", () => {
    const result = evaluate({ target: "status", value: 200, line: 1 }, { status: 500, body: null });
    expect(result).toMatchObject({ passed: false, expected: 200, actual: 500 });
  });

  it("does not treat the text '200' as the number 200", () => {
    const result = evaluate({ target: "status", value: "200", line: 1 }, { status: 200, body: null });
    expect(result.passed).toBe(false);
  });

  it("fails safely when the body is empty", () => {
    const result = evaluate({ target: "body.id", value: 1, line: 1 }, { status: 204, body: null });
    expect(result).toMatchObject({ passed: false, actual: undefined });
  });
});