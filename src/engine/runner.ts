import type { Scenario, Step } from "../ast/types.js";
import { evaluate, type CheckResult } from "../assertions/evaluate.js";
import {
  HttpClientError,
  sendRequest,
  type HttpRequest,
  type HttpResponse,
} from "../http/client.js";

export interface StepResult {
  method: string;
  path: string;
  url: string;
  status?: number;
  checks: CheckResult[];
  error?: string;
  passed: boolean;
}

export interface ScenarioResult {
  name: string;
  steps: StepResult[];
  passed: boolean;
}

export interface RunResult {
  scenarios: ScenarioResult[];
  passed: boolean;
}

export interface RunOptions {
  baseUrl: string;
  timeoutMs?: number;
  /** Replaceable so tests can run without a network. */
  send?: (request: HttpRequest) => Promise<HttpResponse>;
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base + (path.startsWith("/") ? path : `/${path}`);
}

async function runStep(step: Step, options: RunOptions): Promise<StepResult> {
  const url = buildUrl(options.baseUrl, step.path);
  const send = options.send ?? sendRequest;
  const base = { method: step.method, path: step.path, url };

  try {
    const response = await send({
      method: step.method,
      url,
      body: step.body,
      timeoutMs: options.timeoutMs,
    });
    const checks = step.expect.map((expectation) => evaluate(expectation, response));
    return {
      ...base,
      status: response.status,
      checks,
      passed: checks.every((check) => check.passed),
    };
  } catch (error) {
    if (error instanceof HttpClientError) {
      return { ...base, checks: [], error: error.message, passed: false };
    }
    throw error; // anything else is a bug, so let it surface
  }
}

/** Runs scenarios in order. A scenario stops at its first failed step. */
export async function runScenarios(
  scenarios: Scenario[],
  options: RunOptions,
): Promise<RunResult> {
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const steps: StepResult[] = [];
    for (const step of scenario.steps) {
      const result = await runStep(step, options);
      steps.push(result);
      if (!result.passed) break;
    }
    results.push({
      name: scenario.name,
      steps,
      passed: steps.every((step) => step.passed),
    });
  }

  return { scenarios: results, passed: results.every((s) => s.passed) };
}