/** The HTTP methods Scenario can send. */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "QUERY"
  | "HEAD"
  | "OPTIONS";

/** One check on the response, e.g. `status: 200`. */
export interface Expectation {
  target: string; // what to look at, e.g. "status"
  value: string | number | boolean | null; // what it must equal
  line: number; // line in the file, for error messages
}

/** A value to remember from a response, e.g. `userId: body.id`. */
export interface Save {
  name: string; // the variable name
  source: string; // where to read it, e.g. "body.id"
  line: number;
}

/** One request, e.g. `GET /todos/1`, plus its checks. */
export interface Step {
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>; // optional request body
  save?: Save[]; // values to remember for later steps
  expect: Expectation[];
  line: number;
}

/** A named list of steps. */
export interface Scenario {
  name: string;
  steps: Step[];
  line: number;
}