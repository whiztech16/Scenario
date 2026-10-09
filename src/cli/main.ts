import { EXIT, runCli } from "./cli.js";

try {
  process.exitCode = await runCli(process.argv.slice(2), console);
} catch (error) {
  console.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = EXIT.error;
}