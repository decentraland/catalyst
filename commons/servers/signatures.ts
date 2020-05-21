import { EthAddress, Signature, AuthChain, Authenticator, ValidationResult } from "dcl-crypto";
import { EthereumProvider } from "web3x/providers";
import { httpProviderForNetwork } from "decentraland-katalyst-contracts/utils";

// We want all signatures to be "current". We consider "current" to be the current time,
// with a 10 minute tolerance to account for network delays and possibly unsynched clocks
export const VALID_SIGNATURE_TOLERANCE_INTERVAL_MILLIS = 10 * 1000 * 60;

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
    const ownerAddress = Authenticator.ownerAddress(signerData.authChain);
    return ownerAddress === "Invalid-Owner-Address" ? undefined : ownerAddress;
  } else {
    return signerData.simpleSignature?.signer;
  }
}

function validSignatureInterval(timestamp: number) {
  const currentTime = Date.now();
  return timestamp > currentTime - VALID_SIGNATURE_TOLERANCE_INTERVAL_MILLIS && timestamp < currentTime + VALID_SIGNATURE_TOLERANCE_INTERVAL_MILLIS;
}

export type SignatureValidator = (
  expectedFinalAuthority: string,
  authChain: AuthChain,
  provider: EthereumProvider,
  dateToValidateExpirationInMillis?: number
) => Promise<ValidationResult>;

export async function validateSignature(
  signerData: SignerData,
  expectedPayload: string,
  onAuthorized: () => any,
  onNotAuthorized: (message: string) => void,
  signerIsAuthorizedPredicate: (signer: string | undefined) => boolean,
  networkOrProvider: string | EthereumProvider,
  validator: SignatureValidator = Authenticator.validateSignature
) {
  if (!signerData.authChain && !signerData.simpleSignature) {
    onNotAuthorized("This operation requires a signed payload");
  } else if (!validSignatureInterval(signerData.timestamp)) {
    onNotAuthorized("The signature is too old or too far in the future");
  } else if (!signerIsAuthorizedPredicate(getSigner(signerData))) {
    onNotAuthorized("The signer is not authorized to perform this operation");
  } else {
    const authChain = signerData.authChain ?? Authenticator.createSimpleAuthChain(expectedPayload, signerData.simpleSignature!.signer, signerData.simpleSignature!.signature);
    const provider = typeof networkOrProvider === "string" ? httpProviderForNetwork(networkOrProvider) : networkOrProvider;
    const valid = await validator(expectedPayload, authChain, provider, Date.now());

    if (!valid.ok) {
      onNotAuthorized("Invalid signature: " + valid.message);
    } else {
      onAuthorized();
    }
  }
}
