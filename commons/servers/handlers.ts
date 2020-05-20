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
export function validateSignatureHandler(
  messageToSignBuilder: (body: any) => string,
  networkOrProvider: string | EthereumProvider,
  authorizedSignerPredicate: (signer: EthAddress | undefined, body: any) => boolean = (_, __) => true,
  signerDataBuilder: (body: any) => SignerData = (b) => b
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const signerData = signerDataBuilder(req.body);

    await validateSignature(signerData,
      `${messageToSignBuilder(req.body)}${signerData.timestamp}`, 
      next, 
      (message: string) => res.status(401).send({ status: "unauthorized", message }),
      signer => authorizedSignerPredicate(signer, req.body),
      networkOrProvider);
  };
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

async function validateSignature(
  signerData: SignerData,
  expectedPayload: string,
  onAuthorized: () => any,
  onNotAuthorized: (message: string) => void,
  signerIsAuthorizedPredicate: (signer: string | undefined) => boolean,
  networkOrProvider: string | EthereumProvider
) {
  if (!signerData.authChain && !signerData.simpleSignature) {
    onNotAuthorized("This operation requires a signed payload");
  } else if (!validSignatureInterval(signerData.timestamp)) {
    onNotAuthorized("The signature is to old or to far in the future");
  } else if (!signerIsAuthorizedPredicate(getSigner(signerData))) {
    onNotAuthorized("The signer is not authorized to perform this operation");
  } else {
    
    const authChain = signerData.authChain ?? Authenticator.createSimpleAuthChain(expectedPayload, signerData.simpleSignature!.signer, signerData.simpleSignature!.signature);
    const provider = typeof networkOrProvider === "string" ? httpProviderForNetwork(networkOrProvider) : networkOrProvider;
    const valid = await Authenticator.validateSignature(expectedPayload, authChain, provider, Date.now());

    console.log("Valid: " + JSON.stringify(valid));
    if (!valid.ok) {
      onNotAuthorized("Invalid signature: " + valid.message);
    } else {
      onAuthorized();
    }
  }
}
