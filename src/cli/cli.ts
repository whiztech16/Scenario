import { readFile, stat } from "node:fs/promises";
import { parse, ScenarioSyntaxError } from "../parser/parser.js";
import { runScenarios } from "../engine/runner.js";
import { formatRun } from "../reporters/terminal.js";
import type { Scenario } from "../ast/types.js";

export interface Output {
  log(message: string): void;
  error(message: string): void;
}

export const EXIT = { ok: 0, failed: 1, invalid: 2, error: 3 } as const;

const USAGE = "Usage: scenario test <file> [--base-url <url>]";
const MAX_FILE_BYTES = 1024 * 1024;
const DEFAULT_BASE_URL = "http://localhost:3000";

interface Args {
  command: string | undefined;
  file: string | undefined;
  baseUrl: string | undefined;
}

/** Returns null when the arguments are malformed. */
function parseArgs(args: string[]): Args | null {
  const [command, ...rest] = args;
  let file: string | undefined;
  let baseUrl: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--base-url") {
      baseUrl = rest[++i];
      if (!baseUrl) return null;
    } else if (arg.startsWith("--") || file) {
      return null;
    } else {
      file = arg;
    }
  }
  return { command, file, baseUrl };
}

/** Runs the command line and returns the exit code. */
export async function runCli(
  args: string[],
  out: Output,
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const parsed = parseArgs(args);
  if (!parsed || parsed.command !== "test" || !parsed.file) {
    out.error(USAGE);
    return EXIT.error;
  }
  const { file, baseUrl } = parsed;

  let text: string;
  try {
    if ((await stat(file)).size > MAX_FILE_BYTES) {
      out.error(`File is too large (limit 1 MB): ${file}`);
      return EXIT.error;
    }
    text = await readFile(file, "utf8");
  } catch {
    out.error(`Could not read file: ${file}`);
    return EXIT.error;
  }

  let scenarios: Scenario[];
  try {
    scenarios = parse(text);
  } catch (error) {
    if (error instanceof ScenarioSyntaxError) {
      out.error(`${file}\n${error.message}`);
      return EXIT.invalid;
    }
    throw error;
  }

  // An empty file must not look like a pass in CI.
  if (scenarios.length === 0) {
    out.error(`No scenarios found in ${file}`);
    return EXIT.invalid;
  }

  const result = await runScenarios(scenarios, {
    baseUrl: baseUrl ?? env.SCENARIO_BASE_URL ?? DEFAULT_BASE_URL,
  });
  out.log(formatRun(result));
  return result.passed ? EXIT.ok : EXIT.failed;
}