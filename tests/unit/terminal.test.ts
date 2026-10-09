import { describe, it, expect } from "vitest";
import { formatRun } from "../../src/reporters/terminal.js";
import type { RunResult } from "../../src/engine/runner.js";

function result(expected: unknown, actual: unknown, passed: boolean): RunResult {
  return {
    passed,
    scenarios: [
      {
        name: "Check the todos API",
        passed,
        steps: [
          {
            method: "GET",
            path: "/todos/1",
            url: "http://api.test/todos/1",
            status: 200,
            passed,
            checks: [
              {
                passed,
                target: "status",
                expected: expected as number,
                actual,
                line: 6,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("formatRun", () => {
  it("shows a passing scenario", () => {
    const output = formatRun(result(200, 200, true));
    expect(output).toContain("✓ Check the todos API");
    expect(output).toContain("GET /todos/1");
    expect(output).toContain("✓ status = 200");
    expect(output).toContain("1 scenario passed");
  });

  it("shows expected and received values for a failure", () => {
    const output = formatRun(result(200, 500, false));
    expect(output).toContain("✗ Check the todos API");
    expect(output).toContain("✗ status (line 6)");
    expect(output).toContain("Expected: 200");
    expect(output).toContain("Received: 500");
    expect(output).toContain("1 scenario failed");
  });

  it("quotes text so the text 200 and the number 200 look different", () => {
    const output = formatRun(result("200", 200, false));
    expect(output).toContain('Expected: "200"');
    expect(output).toContain("Received: 200");
  });

  it("says when a value is missing", () => {
    const output = formatRun(result(1, undefined, false));
    expect(output).toContain("Received: (missing)");
  });

  it("shows the error message for a step that could not run", () => {
    const run = result(200, 200, false);
    run.scenarios[0].steps[0].checks = [];
    run.scenarios[0].steps[0].error = "Could not connect to http://api.test.";
    expect(formatRun(run)).toContain("✗ Could not connect to http://api.test.");
  });

  it("removes terminal control characters from server values and names", () => {
    const run = result("ok", "\u001b[31mred", false);
    run.scenarios[0].name = "bad\u001b[2Jname";
    expect(formatRun(run)).not.toContain("\u001b");
  });

  it("shortens very long values", () => {
    const output = formatRun(result("ok", "x".repeat(1000), false));
    expect(output).toContain("…");
    expect(output).not.toContain("x".repeat(300));
  });

  it("summarises a mix of passed and failed scenarios", () => {
    const run = result(200, 200, true);
    run.scenarios.push(result(200, 500, false).scenarios[0]);
    run.passed = false;
    expect(formatRun(run)).toContain("1 passed, 1 failed");
  });
});