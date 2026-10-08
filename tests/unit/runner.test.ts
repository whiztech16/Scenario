import { describe, it, expect, vi } from "vitest";
import { runScenarios } from "../../src/engine/runner.js";
import { HttpClientError, type HttpRequest } from "../../src/http/client.js";
import type { Scenario } from "../../src/ast/types.js";

const scenario = (...statuses: number[]): Scenario => ({
  name: "A",
  line: 1,
  steps: statuses.map((status, i) => ({
    method: "GET" as const,
    path: `/s${i}`,
    line: i + 2,
    expect: [{ target: "status", value: status, line: i + 3 }],
  })),
});

const fakeSend = (status: number) =>
  vi.fn(async (_request: HttpRequest) => ({ status, body: null }));

describe("runScenarios", () => {
  it("passes when every check passes", async () => {
    const result = await runScenarios([scenario(200)], {
      baseUrl: "http://api.test",
      send: fakeSend(200),
    });
    expect(result.passed).toBe(true);
    expect(result.scenarios[0].steps[0].status).toBe(200);
  });

  it("fails and reports the check that did not match", async () => {
    const result = await runScenarios([scenario(201)], {
      baseUrl: "http://api.test",
      send: fakeSend(500),
    });
    expect(result.passed).toBe(false);
    expect(result.scenarios[0].steps[0].checks[0]).toMatchObject({
      passed: false,
      expected: 201,
      actual: 500,
    });
  });

  it("joins the base URL and path with exactly one slash", async () => {
    const send = fakeSend(200);
    await runScenarios([scenario(200)], { baseUrl: "http://api.test/", send });
    expect(send.mock.calls[0][0].url).toBe("http://api.test/s0");
  });

  it("sends the method and body from the step", async () => {
    const send = fakeSend(201);
    const post: Scenario = {
      name: "A",
      line: 1,
      steps: [
        { method: "QUERY", path: "/search", body: { q: "a" }, line: 2, expect: [] },
      ],
    };
    await runScenarios([post], { baseUrl: "http://api.test", send });
    expect(send.mock.calls[0][0]).toMatchObject({ method: "QUERY", body: { q: "a" } });
  });

  it("stops a scenario after its first failed step", async () => {
    const send = fakeSend(500);
    const result = await runScenarios([scenario(200, 200)], {
      baseUrl: "http://api.test",
      send,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.scenarios[0].steps).toHaveLength(1);
  });

  it("still runs the next scenario after one fails", async () => {
    const send = fakeSend(500);
    const result = await runScenarios([scenario(200), scenario(500)], {
      baseUrl: "http://api.test",
      send,
    });
    expect(result.scenarios.map((s) => s.passed)).toEqual([false, true]);
  });

  it("records a connection error as a failed step instead of throwing", async () => {
    const send = vi.fn(async (_request: HttpRequest) => {
      throw new HttpClientError("Could not connect to http://api.test.");
    });
    const result = await runScenarios([scenario(200)], {
      baseUrl: "http://api.test",
      send,
    });
    expect(result.passed).toBe(false);
    expect(result.scenarios[0].steps[0].error).toContain("Could not connect");
  });

  it("keeps requests on the base host even for tricky paths", async () => {
    const send = fakeSend(200);
    for (const path of ["http://evil.test/x", "//evil.test/x", "@evil.test"]) {
      const tricky: Scenario = {
        name: "A",
        line: 1,
        steps: [{ method: "GET", path, line: 2, expect: [] }],
      };
      await runScenarios([tricky], { baseUrl: "http://api.test", send });
    }
    for (const call of send.mock.calls) {
      expect(new URL(call[0].url).host).toBe("api.test");
    }
  });
});