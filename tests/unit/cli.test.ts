import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/cli.js";

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/todos/1") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: 1 }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  dir = await mkdtemp(join(tmpdir(), "scenario-"));
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

function capture() {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    out: {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    },
  };
}

async function fileWith(text: string): Promise<string> {
  const path = join(dir, `${Math.random().toString(36).slice(2)}.scenario`);
  await writeFile(path, text);
  return path;
}

const passing = `scenario "A"
GET /todos/1
expect:
  status: 200
`;

describe("runCli", () => {
  it("exits 0 and prints results when everything passes", async () => {
    const file = await fileWith(passing);
    const { out, logs } = capture();
    const code = await runCli(["test", file, "--base-url", base], out, {});
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("1 scenario passed");
  });

  it("exits 1 when a check fails", async () => {
    const file = await fileWith(passing.replace("200", "500"));
    const { out, logs } = capture();
    const code = await runCli(["test", file, "--base-url", base], out, {});
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("Expected: 500");
  });

  it("uses SCENARIO_BASE_URL when no flag is given", async () => {
    const file = await fileWith(passing);
    const { out } = capture();
    const code = await runCli(["test", file], out, { SCENARIO_BASE_URL: base });
    expect(code).toBe(0);
  });

  it("exits 2 and shows the file and line for an invalid file", async () => {
    const file = await fileWith(`scenario "A"\nGTE /todos/1\n`);
    const { out, errors } = capture();
    const code = await runCli(["test", file, "--base-url", base], out, {});
    const message = errors.join("\n");
    expect(code).toBe(2);
    expect(message).toContain(file);
    expect(message).toContain('Error on line 2: unknown keyword "GTE". Did you mean "GET"?');
  });

  it("exits 2 when the file contains no scenarios", async () => {
    const file = await fileWith("# nothing here\n");
    const { out, errors } = capture();
    const code = await runCli(["test", file], out, {});
    expect(code).toBe(2);
    expect(errors.join("\n")).toContain("No scenarios");
  });

  it("exits 3 when the file does not exist", async () => {
    const { out, errors } = capture();
    const code = await runCli(["test", join(dir, "missing.scenario")], out, {});
    expect(code).toBe(3);
    expect(errors.join("\n")).toContain("Could not read");
  });

  it("exits 3 and shows usage for an unknown command", async () => {
    const { out, errors } = capture();
    const code = await runCli(["nope"], out, {});
    expect(code).toBe(3);
    expect(errors.join("\n")).toContain("Usage");
  });

  it("exits 3 when --base-url has no value", async () => {
    const file = await fileWith(passing);
    const { out } = capture();
    const code = await runCli(["test", file, "--base-url"], out, {});
    expect(code).toBe(3);
  });
});