import { describe, it, expect } from "vitest";
import { parse } from "../../src/parser/parser.js";

describe("parse", () => {
  it("parses one GET step with a status check", () => {
    const text = `scenario "Check the todos API"

GET /todos/1

expect:
  status: 200
`;

    expect(parse(text)).toEqual([
      {
        name: "Check the todos API",
        line: 1,
        steps: [
          {
            method: "GET",
            path: "/todos/1",
            line: 3,
            expect: [{ target: "status", value: 200, line: 6 }],
          },
        ],
      },
    ]);
  });

  it("ignores comments and blank lines, and accepts a lowercase method", () => {
    const text = `# my first test
scenario "A"

get /users
`;

    expect(parse(text)).toEqual([
      {
        name: "A",
        line: 2,
        steps: [{ method: "GET", path: "/users", line: 4, expect: [] }],
      },
    ]);
  });

  it("reads several checks and converts their values", () => {
    const text = `scenario "A"
POST /todos
expect:
  status: 201
  body.done: false
  body.title: Buy milk
`;

    expect(parse(text)[0].steps[0].expect).toEqual([
      { target: "status", value: 201, line: 4 },
      { target: "body.done", value: false, line: 5 },
      { target: "body.title", value: "Buy milk", line: 6 },
    ]);
  });

  it("reads more than one step in a scenario", () => {
    const text = `scenario "A"
GET /a
expect:
  status: 200
GET /b
expect:
  status: 404
`;

    const steps = parse(text)[0].steps;
    expect(steps.map((s) => s.path)).toEqual(["/a", "/b"]);
    expect(steps[1].expect[0].value).toBe(404);
  });

  it("throws when a request appears before any scenario", () => {
    expect(() => parse("GET /todos/1")).toThrow("Line 1");
  });

  it("throws on an unknown method, naming the line", () => {
    const text = `scenario "A"

GTE /todos/1
`;

    expect(() => parse(text)).toThrow("Line 3");
  });
});