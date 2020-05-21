import { validateSignatureHandler } from "decentraland-katalyst-commons/handlers";

describe("validate signature handler", () => {
  let request: any;
  let response: any;
  let next: any;

  beforeEach(() => {
    request = {
      body: {},
    };

    response = createResponse();

    next = jasmine.createSpy();
  });

  it("should validate that the signature data is provided", async () => {
    const handler = validateSignatureHandler(() => "", "");

    await handler(request, response, next);

    expectUnauthorized(response, "This operation requires a signed payload", next);
  });

  it("should validate that the timestamp is recent", async () => {
    await expectToFailByTimestamp(Date.now() - 20 * 60 * 1000);
  });

  it("should validate that the timestamp is not in the future", async () => {
    await expectToFailByTimestamp(Date.now() + 20 * 60 * 1000);
  });

  it("should validate that the signer is authorized from simple signature", async () => {
    request.body.simpleSignature = { signer: "unauthorized", signature: "asd" };
    await expectUnauthorizedSigner();
  });

  it("should validate that the signer is authorized from auth chain", async () => {
    request.body.authChain = [{ type: "SIGNER", payload: "unauthorized" }];
    await expectUnauthorizedSigner();
  });

  it("should validate the signature with the provided validator", async () => {
    request.body.timestamp = Date.now();
    request.body.simpleSignature = { signer: "authorized", signature: "asd" };

    const handler = validateSignatureHandler(
      () => "",
      {} as any,
      (signer) => signer == "authorized",
      (b) => b,
      (expected, authChain, provider, date) => Promise.resolve({ ok: false, message: "test" })
    );

    await handler(request, response, next);

    expectUnauthorized(response, "Invalid signature: test", next);
  });

  it("should pass validation when everything is in order", async () => {
    request.body.timestamp = Date.now();
    request.body.simpleSignature = { signer: "authorized", signature: "asd" };

    const theProvider = {} as any;
    const expectedPayloadStart = "toSign";

    const handler = validateSignatureHandler(
      () => expectedPayloadStart,
      theProvider,
      (signer) => signer == "authorized",
      (b) => b,
      (expected, authChain, provider, date) => {
        if (
          expected.startsWith(expectedPayloadStart) &&
          authChain.some((it) => it.payload === "authorized") &&
          authChain.some((it) => it.signature === "asd") &&
          provider === theProvider
        ) {
          return Promise.resolve({ ok: true, message: "passed" });
        } else {
          return Promise.resolve({ ok: false, message: "test failed" });
        }
      }
    );

    await handler(request, response, next);

    expect(response.statusCode).not.toBeDefined();
    expect(response.sent).not.toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  async function expectUnauthorizedSigner() {
    request.body.timestamp = Date.now();

    const handler = validateSignatureHandler(
      () => "",
      "",
      (signer) => signer == "authorized"
    );

    await handler(request, response, next);

    expectUnauthorized(response, "The signer is not authorized to perform this operation", next);
  }

  async function expectToFailByTimestamp(timestamp: number) {
    request.body.simpleSignature = { signer: "hello", signature: "world" };
    request.body.timestamp = timestamp;

    const handler = validateSignatureHandler(() => "", "");

    await handler(request, response, next);

    expectUnauthorized(response, "The signature is too old or too far in the future", next);
  }

  function expectUnauthorized(response: any, message: string, next: any) {
    expect(response.statusCode).toBe(401);
    expect(response.sent).toEqual({
      status: "unauthorized",
      message,
    });
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
    },
  };
}
