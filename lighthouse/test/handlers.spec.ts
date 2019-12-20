import { requireParameters } from "../src/handlers";

describe("require parameters", () => {
  let request: any;
  let response: any;
  let next: any;

  beforeEach(() => {
    request = {
      body: {}
    };

    response = {
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(obj: any) {
        this.sent = obj;
        return this;
      }
    };

    next = jasmine.createSpy();
  });

  it("should respond 400 when parameters are missing", () => {
    const handler = requireParameters(["name", "age"], (req, res) => req.body);

    handler(request, response, next);

    expectMissingParameters(response, "name, age", next);
  });

  it("should respond 400 when some parameters are missing", () => {
    const handler = requireParameters(
      ["name", "age", "surname"],
      (req, res) => req.body
    );

    request.body = { name: "pepe" };

    handler(request, response, next);

    expectMissingParameters(response, "age, surname", next);
  });

  it("should work when all parameters are provided", () => {
    const handler = requireParameters(["name", "age"], (req, res) => req.body);

    request.body = { name: "pepe", age: 33 };

    handler(request, response, next);

    expect(next).toHaveBeenCalled();
  });
});

function expectMissingParameters(response: any, parameters: string, next: any) {
  expect(response.statusCode).toBe(400);
  expect(response.sent).toEqual({
    status: "bad-request",
    message: `Missing required parameters: ${parameters}`
  });

  expect(next).not.toHaveBeenCalled();
}
