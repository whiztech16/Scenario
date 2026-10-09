import { describe, it, expect } from "vitest";
import { parse } from "../../src/parser/parser.js";

const scenarioWith = (...lines: string[]) => ['scenario "A"', ...lines].join("\n");
const firstStep = (text: string) => parse(text)[0].steps[0];

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

  it("accepts keywords in any letter case", () => {
    const text = `Scenario "A"
GET /a
EXPECT:
  status: 200
`;
    expect(firstStep(text).expect).toHaveLength(1);
  });

  it("reads several checks and converts their values", () => {
    const text = scenarioWith(
      "POST /todos",
      "expect:",
      "  status: 201",
      "  body.done: false",
      "  body.title: Buy milk",
    );

    expect(firstStep(text).expect).toEqual([
      { target: "status", value: 201, line: 4 },
      { target: "body.done", value: false, line: 5 },
      { target: "body.title", value: "Buy milk", line: 6 },
    ]);
  });

  it("reads more than one step in a scenario", () => {
    const text = scenarioWith(
      "GET /a",
      "expect:",
      "  status: 200",
      "GET /b",
      "expect:",
      "  status: 404",
    );

    const steps = parse(text)[0].steps;
    expect(steps.map((s) => s.path)).toEqual(["/a", "/b"]);
    expect(steps[1].expect[0].value).toBe(404);
  });

  it("reads more than one scenario in a file", () => {
    const text = `scenario "A"
GET /a
scenario "B"
GET /b
`;
    expect(parse(text).map((s) => s.name)).toEqual(["A", "B"]);
  });
});

describe("parse request bodies", () => {
  it("reads a flat body and converts values", () => {
    const text = scenarioWith(
      "POST /todos",
      "body:",
      "  title: Buy milk",
      "  done: false",
      "  count: 3",
      "  note: null",
    );
    expect(firstStep(text).body).toEqual({
      title: "Buy milk",
      done: false,
      count: 3,
      note: null,
    });
  });

  it("reads nested objects and returns to the outer level", () => {
    const text = scenarioWith(
      "POST /users",
      "body:",
      "  name: Ada",
      "  address:",
      "    city: Lagos",
      "    geo:",
      "      lat: 6.5",
      "  active: true",
    );
    expect(firstStep(text).body).toEqual({
      name: "Ada",
      address: { city: "Lagos", geo: { lat: 6.5 } },
      active: true,
    });
  });

  it("reads inline JSON arrays and objects", () => {
    const text = scenarioWith(
      "POST /todos",
      "body:",
      '  tags: ["a", "b"]',
      '  meta: {"priority": 1}',
    );
    expect(firstStep(text).body).toEqual({ tags: ["a", "b"], meta: { priority: 1 } });
  });

  it("does not let an empty nested object swallow the next key", () => {
    const text = scenarioWith("POST /x", "body:", "  empty:", "  next: 1");
    expect(firstStep(text).body).toEqual({ empty: {}, next: 1 });
  });

  it("keeps the body and the checks on the same step, in either order", () => {
    const bodyFirst = scenarioWith(
      "POST /todos",
      "body:",
      "  title: x",
      "expect:",
      "  status: 201",
    );
    const expectFirst = scenarioWith(
      "POST /todos",
      "expect:",
      "  status: 201",
      "body:",
      "  title: x",
    );

    for (const text of [bodyFirst, expectFirst]) {
      const step = firstStep(text);
      expect(step.body).toEqual({ title: "x" });
      expect(step.expect).toHaveLength(1);
    }
  });

  it("allows a body on PUT, PATCH, DELETE and QUERY", () => {
    for (const method of ["PUT", "PATCH", "DELETE", "QUERY"]) {
      const text = scenarioWith(`${method} /x`, "body:", "  q: a");
      expect(firstStep(text).body).toEqual({ q: "a" });
    }
  });

  it("gives each step its own body", () => {
    const text = scenarioWith(
      "POST /a",
      "body:",
      "  n: 1",
      "POST /b",
      "body:",
      "  n: 2",
    );
    const steps = parse(text)[0].steps;
    expect(steps.map((s) => s.body)).toEqual([{ n: 1 }, { n: 2 }]);
  });
});

describe("parse errors", () => {
  it("rejects a request before any scenario", () => {
    expect(() => parse("GET /todos/1")).toThrow(
      'Error on line 1: a request must come after a "scenario" line',
    );
  });

  it("suggests the right method when one is misspelled", () => {
    expect(() => parse(scenarioWith("", "GTE /todos/1"))).toThrow(
      'Error on line 3: unknown keyword "GTE". Did you mean "GET"?',
    );
  });

  it("suggests scenario when it is misspelled", () => {
    expect(() => parse('scenaro "A"')).toThrow(
      'Error on line 1: unknown keyword "scenaro". Did you mean "scenario"?',
    );
  });

  it("suggests expect when the block name is misspelled", () => {
    expect(() => parse(scenarioWith("GET /a", "exepct:", "  status: 200"))).toThrow(
      'Error on line 3: unknown keyword "exepct". Did you mean "expect"?',
    );
  });

  it("suggests body when the block name is misspelled", () => {
    expect(() => parse(scenarioWith("POST /a", "bdoy:", "  a: 1"))).toThrow(
      'unknown keyword "bdoy". Did you mean "body"?',
    );
  });

  it("suggests status when a check name is misspelled", () => {
    expect(() => parse(scenarioWith("GET /a", "expect:", "  staus: 200"))).toThrow(
      'Error on line 4: unknown check "staus". Did you mean "status"?',
    );
  });

  it("suggests body when a body check is misspelled", () => {
    expect(() => parse(scenarioWith("GET /a", "expect:", "  bdy.id: 1"))).toThrow(
      'unknown check "bdy". Did you mean "body"?',
    );
  });

  it("explains valid checks when the name is not close to anything", () => {
    expect(() => parse(scenarioWith("GET /a", "expect:", "  banana: 1"))).toThrow(
      'Checks start with "status" or "body"',
    );
  });

  it("says a method needs a path", () => {
    expect(() => parse(scenarioWith("GET"))).toThrow(
      'Error on line 2: "GET" needs a path, for example: GET /todos/1',
    );
  });

  it("says a scenario needs a name", () => {
    expect(() => parse("scenario")).toThrow('"scenario" needs a name');
  });

  it("says a check must be under expect", () => {
    expect(() => parse(scenarioWith("GET /a", "status: 200"))).toThrow(
      'Error on line 3: "status" checks must come under an "expect:" line',
    );
  });

  it("says expect must come after a request", () => {
    expect(() => parse(scenarioWith("expect:"))).toThrow(
      '"expect" must come after a request',
    );
  });

  it("explains the format when a check has no colon", () => {
    const text = scenarioWith("GET /a", "expect:", "  status 200");
    expect(() => parse(text)).toThrow("Error on line 4");
    expect(() => parse(text)).toThrow('"target: value"');
  });

  it("explains what a line may start with when nothing is close", () => {
    expect(() => parse(scenarioWith("banana"))).toThrow(
      'unknown keyword "banana". A line must start with scenario, expect',
    );
  });

  it("does not echo raw control characters from the file", () => {
    let message = "";
    try {
      parse(scenarioWith("\u001b[31mbanana"));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("\u001b");
  });
});

describe("parse body errors", () => {
  it("rejects a body on GET", () => {
    expect(() => parse(scenarioWith("GET /a", "body:", "  q: 1"))).toThrow(
      "Error on line 3: GET requests cannot have a body. Use POST, PUT, PATCH or QUERY",
    );
  });

  it("rejects a body before any request", () => {
    expect(() => parse(scenarioWith("body:", "  a: 1"))).toThrow(
      '"body" must come after a request',
    );
  });

  it("rejects a second body on the same request", () => {
    const text = scenarioWith("POST /a", "body:", "  a: 1", "body:", "  b: 2");
    expect(() => parse(text)).toThrow('this request already has a "body" block');
  });

  it("rejects a body line without a colon", () => {
    expect(() => parse(scenarioWith("POST /a", "body:", "  title Buy milk"))).toThrow(
      'Error on line 4: expected "key: value" inside body',
    );
  });

  it("rejects invalid inline JSON", () => {
    expect(() => parse(scenarioWith("POST /a", "body:", "  tags: [a, b"))).toThrow(
      "Error on line 4: invalid JSON",
    );
  });

  it("rejects unexpected indentation", () => {
    const text = scenarioWith("POST /a", "body:", "  a: 1", "    b: 2");
    expect(() => parse(text)).toThrow("Error on line 5: unexpected indentation");
  });

  it("rejects misaligned keys", () => {
    const text = scenarioWith("POST /a", "body:", "  user:", "    a: 1", "   b: 2");
    expect(() => parse(text)).toThrow("Error on line 6: inconsistent indentation");
  });

  it("rejects a repeated key", () => {
    const text = scenarioWith("POST /a", "body:", "  a: 1", "  a: 2");
    expect(() => parse(text)).toThrow('the key "a" appears twice');
  });

  it("rejects the __proto__ key", () => {
    const text = scenarioWith("POST /a", "body:", "  __proto__: 1");
    expect(() => parse(text)).toThrow('the key "__proto__" is not allowed');
  });

  it("rejects bodies nested too deeply", () => {
    const lines = ["POST /a", "body:"];
    for (let depth = 0; depth < 25; depth++) {
      lines.push(`${"  ".repeat(depth + 1)}k${depth}:`);
    }
    expect(() => parse(scenarioWith(...lines))).toThrow("nested too deeply");
  });

  it("explains that block lines must be indented", () => {
    expect(() => parse(scenarioWith("POST /a", "body:", "title: Buy milk"))).toThrow(
      "Lines inside a block must be indented",
    );
  });
});
describe("parse save blocks and variables", () => {
  it("reads saved values", () => {
    const text = scenarioWith("GET /posts/1", "save:", "  authorId: body.userId", "  code: status");
    expect(firstStep(text).save).toEqual([
      { name: "authorId", source: "body.userId", line: 4 },
      { name: "code", source: "status", line: 5 },
    ]);
  });

  it("allows the save block before or after expect", () => {
    const saveFirst = scenarioWith("GET /a", "save:", "  id: body.id", "expect:", "  status: 200");
    const expectFirst = scenarioWith("GET /a", "expect:", "  status: 200", "save:", "  id: body.id");
    for (const text of [saveFirst, expectFirst]) {
      const step = firstStep(text);
      expect(step.save).toHaveLength(1);
      expect(step.expect).toHaveLength(1);
    }
  });

  it("keeps variable placeholders in paths, body values and checks", () => {
    const text = scenarioWith(
      "POST /users/{id}/notes",
      "body:",
      "  owner: {id}",
      "  text: Hello {name}",
      "expect:",
      "  body.owner: {id}",
    );
    const step = firstStep(text);
    expect(step.path).toBe("/users/{id}/notes");
    expect(step.body).toEqual({ owner: "{id}", text: "Hello {name}" });
    expect(step.expect[0].value).toBe("{id}");
  });

  it("rejects save before any request", () => {
    expect(() => parse(scenarioWith("save:", "  a: body.id"))).toThrow(
      '"save" must come after a request',
    );
  });

  it("suggests save when the block name is misspelled", () => {
    expect(() => parse(scenarioWith("GET /a", "sve:", "  a: body.id"))).toThrow(
      'unknown keyword "sve". Did you mean "save"?',
    );
  });

  it("rejects an invalid variable name", () => {
    expect(() => parse(scenarioWith("GET /a", "save:", "  1abc: body.id"))).toThrow(
      'invalid variable name "1abc"',
    );
  });

  it("rejects a save with no source", () => {
    expect(() => parse(scenarioWith("GET /a", "save:", "  token:"))).toThrow(
      '"token" needs a source',
    );
  });

  it("suggests a correction for a misspelled source", () => {
    expect(() => parse(scenarioWith("GET /a", "save:", "  id: bdy.id"))).toThrow(
      'unknown source "bdy". Did you mean "body"?',
    );
  });

  it("rejects the same variable saved twice in one step", () => {
    const text = scenarioWith("GET /a", "save:", "  id: body.id", "  id: body.other");
    expect(() => parse(text)).toThrow('the variable "id" is saved twice in this step');
  });

  it("explains the format when a save line has no colon", () => {
    expect(() => parse(scenarioWith("GET /a", "save:", "  id body.id"))).toThrow(
      'expected "name: source"',
    );
  });
});