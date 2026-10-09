import type { RunResult, StepResult } from "../engine/runner.js";

const MAX_VALUE_LENGTH = 200;

/** Replaces control characters so server data cannot manipulate the terminal. */
function clean(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, "?");
}

/** Formats a value for display. Text is quoted so "200" differs from 200. */
function show(value: unknown): string {
  const text = value === undefined ? "(missing)" : (JSON.stringify(value) ?? String(value));
  const short = text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
  return clean(short);
}

function formatStep(step: StepResult): string[] {
  const lines = [`  ${clean(step.method)} ${clean(step.path)}`];

  for (const check of step.checks) {
    const target = clean(check.target);
    if (check.passed) {
      lines.push(`  ✓ ${target} = ${show(check.expected)}`);
    } else {
      lines.push(
        `  ✗ ${target} (line ${check.line})`,
        `    Expected: ${show(check.expected)}`,
        `    Received: ${show(check.actual)}`,
      );
    }
  }

  if (step.error) lines.push(`  ✗ ${clean(step.error)}`);
  return lines;
}

function summary(result: RunResult): string {
  const failed = result.scenarios.filter((s) => !s.passed).length;
  const passed = result.scenarios.length - failed;
  const count = (n: number) => `${n} scenario${n === 1 ? "" : "s"}`;

  if (failed === 0) return `${count(passed)} passed`;
  if (passed === 0) return `${count(failed)} failed`;
  return `${passed} passed, ${failed} failed`;
}

/** Turns a run result into the text shown in the terminal. */
export function formatRun(result: RunResult): string {
  const lines = ["Scenario", ""];

  for (const scenario of result.scenarios) {
    lines.push(`${scenario.passed ? "✓" : "✗"} ${clean(scenario.name)}`, "");
    for (const step of scenario.steps) lines.push(...formatStep(step), "");
  }

  lines.push(summary(result));
  return lines.join("\n");
}