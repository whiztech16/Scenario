import type { HttpMethod, Scenario, Step } from "../ast/types.js";

/** Raised when a `.scenario` file cannot be understood. */
export class ScenarioSyntaxError extends Error {
  constructor(
    readonly line: number,
    detail: string,
  ) {
    super(`Error on line ${line}: ${detail}`);
  }
}

function fail(line: number, detail: string): never {
  throw new ScenarioSyntaxError(line, detail);
}

const METHODS: HttpMethod[] = [
  "GET", "POST", "PUT", "PATCH", "DELETE", "QUERY", "HEAD", "OPTIONS",
];
const METHODS_WITHOUT_BODY: HttpMethod[] = ["GET", "HEAD"];

/** Words a line may start with. */
const KEYWORDS: string[] = ["scenario", "expect", "body", "save", ...METHODS];

/** What a check or a save may read. `body` can continue with a path, e.g. `body.id`. */
const TARGETS = ["status", "body"];

const MAX_BODY_DEPTH = 20;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isMethod(word: string): word is HttpMethod {
  return (METHODS as string[]).includes(word);
}

/** Number of single-character edits needed to turn `a` into `b`. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = current;
    }
  }
  return row[b.length];
}

/** Returns the closest candidate, or undefined if none is close. */
function suggest(word: string, candidates: string[]): string | undefined {
  const lower = word.toLowerCase();
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const d = distance(lower, candidate.toLowerCase());
    // d === 0 is an exact match, which callers handle themselves.
    if (d > 0 && d < bestDistance && d < word.length) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}

/** Checks that something like `body.id` starts with a known response part. */
function checkTarget(target: string, line: number, label: "check" | "source"): void {
  const root = target.split(".")[0];

  if (root === "status" && target !== "status") {
    fail(line, '"status" has no sub-fields');
  }
  if (root !== "status" && root !== "body") {
    const quotedRoot = JSON.stringify(root);
    const guess = suggest(root, TARGETS);
    if (guess) fail(line, `unknown ${label} ${quotedRoot}. Did you mean "${guess}"?`);
    fail(
      line,
      label === "check"
        ? `unknown check ${quotedRoot}. Checks start with "status" or "body", ` +
            'for example "status: 200" or "body.id: 7"'
        : `unknown source ${quotedRoot}. Sources start with "status" or "body", ` +
            'for example "body.id"',
    );
  }
}

/** Leading whitespace width. A tab counts as two spaces. */
function indentOf(raw: string): number {
  let width = 0;
  for (const char of raw) {
    if (char === " ") width += 1;
    else if (char === "\t") width += 2;
    else break;
  }
  return width;
}

/** Converts raw text such as `200` or `true` into a typed value. */
function parseValue(raw: string): string | number | boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw.replace(/^"(.*)"$/, "$1"); // strip surrounding quotes
}

/** Like parseValue, but also accepts inline JSON arrays and objects. */
function parseBodyValue(raw: string, line: number): unknown {
  // `{name}` is a variable placeholder, not a JSON object.
  const looksLikeJson = raw.startsWith("[") || (raw.startsWith("{") && !/^\{[A-Za-z_]/.test(raw));
  if (looksLikeJson) {
    try {
      return JSON.parse(raw);
    } catch {
      fail(
        line,
        `invalid JSON ${JSON.stringify(raw.slice(0, 40))}. Use double quotes, for example ["a", "b"]`,
      );
    }
  }
  return parseValue(raw);
}

/** One object being filled in while reading a `body:` block. */
interface Level {
  value: Record<string, unknown>;
  /** Indent of the key that opened this object (-1 for the top level). */
  parentIndent: number;
  /** Indent of this object's own keys, known after its first line. */
  keyIndent?: number;
}

/** Adds one `key: value` line to the body being built. */
function addBodyLine(stack: Level[], indent: number, trimmed: string, line: number): void {
  const colon = trimmed.indexOf(":");
  if (colon <= 0) {
    fail(line, 'expected "key: value" inside body, for example "title: Buy milk"');
  }

  const key = trimmed.slice(0, colon).trim();
  const raw = trimmed.slice(colon + 1).trim();
  if (key === "__proto__") fail(line, 'the key "__proto__" is not allowed');

  // Step back out of nested objects that this line no longer belongs to.
  let steppedOut = false;
  for (;;) {
    const top = stack[stack.length - 1];
    if (top.keyIndent === undefined) {
      if (indent > top.parentIndent) {
        top.keyIndent = indent;
        break;
      }
      stack.pop(); // the nested object was empty
      steppedOut = true;
    } else if (indent < top.keyIndent && stack.length > 1) {
      stack.pop();
      steppedOut = true;
    } else {
      break;
    }
  }

  const level = stack[stack.length - 1];
  const keyIndent = level.keyIndent ?? indent;
  if (indent > keyIndent) {
    fail(
      line,
      steppedOut
        ? "inconsistent indentation. Align this line with the keys above it"
        : "unexpected indentation. Indent only under a key that ends with a colon",
    );
  }
  if (indent < keyIndent) {
    fail(line, "inconsistent indentation. Align this line with the keys above it");
  }
  if (Object.hasOwn(level.value, key)) {
    fail(line, `the key ${JSON.stringify(key)} appears twice`);
  }

  if (raw === "") {
    if (stack.length >= MAX_BODY_DEPTH) {
      fail(line, `body is nested too deeply (limit ${MAX_BODY_DEPTH} levels)`);
    }
    const child: Record<string, unknown> = {};
    level.value[key] = child;
    stack.push({ value: child, parentIndent: indent });
  } else {
    level.value[key] = parseBodyValue(raw, line);
  }
}

type Mode = "none" | "expect" | "body" | "save";

/** Turns the text of a `.scenario` file into scenarios. */
export function parse(text: string): Scenario[] {
  const scenarios: Scenario[] = [];
  let scenario: Scenario | undefined;
  let step: Step | undefined;
  let mode: Mode = "none";
  let blockIndent = 0;
  let bodyStack: Level[] = [];

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const indent = indentOf(rawLine);

    // Lines indented under `body:` belong to the body.
    if (mode === "body") {
      if (indent > blockIndent) {
        addBodyLine(bodyStack, indent, trimmed, line);
        continue;
      }
      mode = "none";
    }

    // scenario "Name"
    const header = trimmed.match(/^scenario(?:\s+(.*))?$/i);
    if (header) {
      const name = (header[1] ?? "").trim().replace(/^"(.*)"$/, "$1");
      if (name === "") {
        fail(line, '"scenario" needs a name, for example: scenario "Check the todos API"');
      }
      scenario = { name, steps: [], line };
      scenarios.push(scenario);
      step = undefined;
      mode = "none";
      continue;
    }

    // GET /path
    const request = trimmed.match(/^(\w+)\s+(\S+)$/);
    const method = request?.[1].toUpperCase();
    if (request && method && isMethod(method)) {
      if (!scenario) fail(line, 'a request must come after a "scenario" line');
      step = { method, path: request[2], expect: [], line };
      scenario.steps.push(step);
      mode = "none";
      continue;
    }

    // expect:  or  body:  or  save:
    const block = trimmed.match(/^(expect|body|save):?$/i);
    if (block) {
      const name = block[1].toLowerCase();
      if (!step) fail(line, `"${name}" must come after a request, for example: GET /todos/1`);
      if (name === "expect") {
        mode = "expect";
      } else if (name === "save") {
        step.save ??= [];
        mode = "save";
      } else {
        if (step.body) fail(line, 'this request already has a "body" block');
        if (METHODS_WITHOUT_BODY.includes(step.method)) {
          fail(line, `${step.method} requests cannot have a body. Use POST, PUT, PATCH or QUERY`);
        }
        const body: Record<string, unknown> = {};
        step.body = body;
        bodyStack = [{ value: body, parentIndent: -1 }];
        blockIndent = indent;
        mode = "body";
      }
      continue;
    }

    // target: value
    if (mode === "expect" && step) {
      const colon = trimmed.indexOf(":");
      if (colon > 0) {
        const target = trimmed.slice(0, colon).trim();
        checkTarget(target, line, "check");
        step.expect.push({
          target,
          value: parseValue(trimmed.slice(colon + 1).trim()),
          line,
        });
        continue;
      }
    }

    // name: source
    if (mode === "save" && step) {
      const colon = trimmed.indexOf(":");
      if (colon > 0) {
        const name = trimmed.slice(0, colon).trim();
        const source = trimmed.slice(colon + 1).trim();
        if (!VARIABLE_NAME.test(name)) {
          fail(
            line,
            `invalid variable name ${JSON.stringify(name)}. ` +
              "Use letters, numbers and underscores, for example: userId",
          );
        }
        if (source === "") fail(line, `"${name}" needs a source, for example: ${name}: body.id`);
        checkTarget(source, line, "source");

        const saves = (step.save ??= []);
        if (saves.some((save) => save.name === name)) {
          fail(line, `the variable "${name}" is saved twice in this step`);
        }
        saves.push({ name, source, line });
        continue;
      }
    }

    // Nothing matched: explain as helpfully as we can.
    const word = trimmed.split(/[\s:]/)[0];
    const quoted = JSON.stringify(word); // quotes and escapes control characters

    if (isMethod(word.toUpperCase())) {
      const upper = word.toUpperCase();
      fail(
        line,
        trimmed.split(/\s+/).length === 1
          ? `"${upper}" needs a path, for example: ${upper} /todos/1`
          : `a request looks like "${upper} /path", but this line has extra text`,
      );
    }

    const guess = suggest(word, KEYWORDS);
    if (guess) fail(line, `unknown keyword ${quoted}. Did you mean "${guess}"?`);

    if (mode === "expect") {
      fail(line, 'expected "target: value", for example "status: 200"');
    }
    if (mode === "save") {
      fail(line, 'expected "name: source", for example "userId: body.id"');
    }

    if (TARGETS.includes(word.split(".")[0])) {
      fail(line, `${quoted} checks must come under an "expect:" line`);
    }

    fail(
      line,
      `unknown keyword ${quoted}. A line must start with scenario, expect, body, save, ` +
        "or a method such as GET or POST. Lines inside a block must be indented.",
    );
  }

  return scenarios;
}