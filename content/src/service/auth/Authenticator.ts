import { Authenticator, EthAddress, AuthChain, ValidationResult } from "dcl-crypto";
import { EthereumProvider } from "web3x/providers";
import { DECENTRALAND_ADDRESS } from "decentraland-katalyst-commons/addresses";

export class ContentAuthenticator extends Authenticator {
  constructor(private readonly decentralandAddress: EthAddress = DECENTRALAND_ADDRESS) {
    super();
  }

  /** Return whether the given address used is owned by Decentraland */
  isAddressOwnedByDecentraland(address: EthAddress) {
    return address.toLocaleLowerCase() === this.decentralandAddress.toLocaleLowerCase();
  }

  /** Validate that the signature belongs to the Ethereum address */
  async validateSignature(expectedFinalAuthority: string, authChain: AuthChain, provider: EthereumProvider, dateToValidateExpirationInMillis: number): Promise<ValidationResult> {
    return Authenticator.validateSignature(expectedFinalAuthority, authChain, provider, dateToValidateExpirationInMillis);
  }
}
