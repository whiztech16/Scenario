import { describe, it, expect } from "vitest";
import {
  interpolateText,
  interpolateValue,
  VariableError,
} from "../../src/variables/interpolate.js";

const vars = new Map<string, unknown>([
  ["id", 7],
  ["name", "Ada"],
  ["obj", { a: 1 }],
]);

describe("interpolateText", () => {
  it("replaces placeholders with saved values", () => {
    expect(interpolateText("/users/{id}/notes/{name}", vars)).toBe("/users/7/notes/Ada");
  });

  it("encodes values when an encoder is given", () => {
    const tricky = new Map([["x", "a/b c?"]]);
    expect(interpolateText("/f/{x}", tricky, encodeURIComponent)).toBe("/f/a%2Fb%20c%3F");
  });

  it("inserts values literally, even when they contain $ patterns", () => {
    const dollar = new Map([["x", "$&"]]);
    expect(interpolateText("a{x}b", dollar)).toBe("a$&b");
  });

  it("leaves text that only looks like JSON alone", () => {
    expect(interpolateText('{"a": 1}', vars)).toBe('{"a": 1}');
  });

  it("throws a clear error for a variable that was never saved", () => {
    expect(() => interpolateText("/x/{missing}", vars)).toThrow(VariableError);
    expect(() => interpolateText("/x/{missing}", vars)).toThrow(
      "The variable {missing} has not been saved yet.",
    );
  });

  it("refuses to put an object inside text", () => {
    expect(() => interpolateText("v={obj}", vars)).toThrow("cannot be placed inside text");
  });
});

describe("interpolateValue", () => {
  it("keeps the type when the whole string is one placeholder", () => {
    expect(interpolateValue("{id}", vars)).toBe(7);
    expect(interpolateValue("{obj}", vars)).toEqual({ a: 1 });
  });

  it("builds text when the placeholder is part of a longer string", () => {
    expect(interpolateValue("user {id}", vars)).toBe("user 7");
  });

  it("fills placeholders deep inside arrays and objects", () => {
    expect(interpolateValue({ a: ["{id}", { b: "{name}" }] }, vars)).toEqual({
      a: [7, { b: "Ada" }],
    });
  });

  it("leaves numbers, booleans, null and undefined untouched", () => {
    expect(interpolateValue(5, vars)).toBe(5);
    expect(interpolateValue(false, vars)).toBe(false);
    expect(interpolateValue(null, vars)).toBeNull();
    expect(interpolateValue(undefined, vars)).toBeUndefined();
  });

  it("keeps a __proto__ key as plain data", () => {
    const input = JSON.parse('{"__proto__": {"x": 1}}');
    const result = interpolateValue(input, vars) as object;
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
  });
});