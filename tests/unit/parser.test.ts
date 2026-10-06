import { describe, it, expect } from "vitest";
import { parse } from "../../src/parser/parser.ts";

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
});