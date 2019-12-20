import { requireParameters, validatePeerToken } from "../src/handlers";

describe("require parameters", () => {
  let request: any;
  let response: any;
  let next: any;

  beforeEach(() => {
    request = {
      body: {}
    };

    response = createResponse();

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

  function expectMissingParameters(
    response: any,
    parameters: string,
    next: any
  ) {
    expect(response.statusCode).toBe(400);
    expect(response.sent).toEqual({
      status: "bad-request",
      message: `Missing required parameters: ${parameters}`
    });

    expect(next).not.toHaveBeenCalled();
  }
});

describe("Validate token", () => {
  let request: any = {
    header(header: string) {
      return this._token;
    },
    body: { userId: "userId" }
  };
  let response: any;
  let realm: any;
  let next = jasmine.createSpy();

  const validToken = "valid-token";

  beforeEach(() => {
    response = createResponse();
    realm = {
      getClientById(id) {
        return {
          getToken: () => validToken
        };
      }
    };
  });

  it("should reject when no token is provided", () => {
    const handler = validatePeerToken(() => realm);

    handler(request, response, next);

    expectInvalidToken(response);
  });

  it("should reject when the token is not the one in the realm", () => {
    const handler = validatePeerToken(() => realm);

    request._token = "not-valid-token";

    handler(request, response, next);

    expectInvalidToken(response);
  });

  it("should allow when the token is the one in the realm", () => {
    const handler = validatePeerToken(() => realm);

    request._token = validToken;

    handler(request, response, next);

    expect(next).toHaveBeenCalled();
  });

  function expectInvalidToken(response: any) {
    expect(response.statusCode).toBe(401);
    expect(response.sent).toEqual({ status: "invalid-token" });
    expect(next).not.toHaveBeenCalled();
  }
});

function createResponse(): any {
  return {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(obj: any) {
      this.sent = obj;
      return this;
    }
  };
}
