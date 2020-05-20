import { Request, Response, NextFunction, RequestHandler } from "express-serve-static-core";
import { EthAddress, Signature, AuthChain, Authenticator, AuthLinkType } from "dcl-crypto";
import { EthereumProvider } from "web3x/providers";
import { httpProviderForNetwork } from "decentraland-katalyst-contracts/utils";

// We want all signatures to be "current". We consider "current" to be the current time,
// with a 10 minute tolerance to account for network delays and possibly unsynched clocks
export const VALID_SIGNATURE_TOLERANCE_INTERVAL_MILLIS = 10 * 1000 * 60;

/**
 *
 * @param messageToSignBuilder Function to build the signature payload to test against. Keep in mind that the timestamp will be appended to the result.
 * @param signerDataBuilder Function to build the signer data. By default, it tries to get all the data from the root of the body
 * @param authorizedSignerPredicate Predicate to check if the signer is authorized to perform this operation. By default it is always authorized
 * @param networkOrProvider Parameter to use to create the EthereumProvider to validate the signature. If it is a string, it is interpreted as the network name and an HTTP Provider is used.
 */
export function validateSignature(
  messageToSignBuilder: (body: any) => string,
  networkOrProvider: string | EthereumProvider,
  authorizedSignerPredicate: (signer: EthAddress | undefined, body: any) => boolean = (_, __) => true,
  signerDataBuilder: (body: any) => SignerData = (b) => b
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const signerData = signerDataBuilder(req.body);
    if (!signerData.authChain && !signerData.simpleSignature) {
      unauthorized(res, "This operation requires a signed payload");
    } else if (!validSignatureInterval(signerData.timestamp)) {
      unauthorized(res, "The signature is to old or to far in the future");
    } else if (!authorizedSignerPredicate(getSigner(signerData), req.body)) {
      unauthorized(res, "The signer is not authorized to perform this operation");
    } else {
      const expected = `${messageToSignBuilder(req.body)}${signerData.timestamp}`;

      const authChain = signerData.authChain ?? Authenticator.createSimpleAuthChain(expected, signerData.simpleSignature!.signer, signerData.simpleSignature!.signature);

      const provider = typeof networkOrProvider === "string" ? httpProviderForNetwork(networkOrProvider) : networkOrProvider;
      
      const valid = await Authenticator.validateSignature(expected, authChain, provider, Date.now())

      console.log("Valid: " + JSON.stringify(valid));

      if (!valid.ok) {
        unauthorized(res, "Invalid signature: " + valid.message);
      } else {
        next();
      }
    }
  };

  function getSigner(signerData: SignerData) {
    if (signerData.authChain) {
      return signerData.authChain.find((it) => it.type === AuthLinkType.SIGNER)?.payload;
    } else {
      return signerData.simpleSignature?.signer;
    }
  }

  function validSignatureInterval(timestamp: number) {
    const currentTime = Date.now();
    return timestamp > currentTime - VALID_SIGNATURE_TOLERANCE_INTERVAL_MILLIS && timestamp < currentTime + VALID_SIGNATURE_TOLERANCE_INTERVAL_MILLIS;
  }

  function unauthorized(res: Response<any>, message: string) {
    res.status(401).send({ status: "unauthorized", message });
  }
}

export type SimpleSignature = {
  signer: EthAddress;
  signature: Signature;
};

export type SignerData = {
  authChain?: AuthChain;
  simpleSignature?: SimpleSignature;
  timestamp: number;
};
