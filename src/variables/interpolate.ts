/** Raised when a `{name}` placeholder cannot be filled in. */
export class VariableError extends Error {}

/** Values saved by earlier steps, keyed by name. */
export type Variables = Map<string, unknown>;

const NAME = "[A-Za-z_][A-Za-z0-9_]*";
const WHOLE = new RegExp(`^\\{(${NAME})\\}$`);
const PLACEHOLDER = new RegExp(`\\{(${NAME})\\}`, "g");

function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

function lookup(vars: Variables, name: string): unknown {
  if (!vars.has(name)) {
    throw new VariableError(`The variable {${name}} has not been saved yet.`);
  }
  return vars.get(name);
}

/** Replaces `{name}` in text. Each value goes through `encode` first. */
export function interpolateText(
  text: string,
  vars: Variables,
  encode: (value: string) => string = (value) => value,
): string {
  // A replacer function inserts values literally, so `$&` in a value is safe.
  return text.replace(PLACEHOLDER, (_match, name: string) => {
    const value = lookup(vars, name);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return encode(String(value));
    }
    throw new VariableError(
      `The variable {${name}} holds ${kindOf(value)}, which cannot be placed inside text.`,
    );
  });
}

/**
 * Fills placeholders inside any value. A string that is exactly `{name}`
 * becomes the saved value itself, so numbers and objects keep their type.
 */
export function interpolateValue(value: unknown, vars: Variables): unknown {
  if (typeof value === "string") {
    const whole = WHOLE.exec(value);
    return whole ? lookup(vars, whole[1]) : interpolateText(value, vars);
  }
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, vars));
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // defineProperty keeps a key like "__proto__" as plain data.
      Object.defineProperty(result, key, {
        value: interpolateValue(item, vars),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  }
  return value;
}