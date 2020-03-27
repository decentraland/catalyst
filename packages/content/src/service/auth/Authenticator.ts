import { Authenticator, EthAddress, AuthChain, ValidationResult } from "dcl-crypto";
import { EthereumProvider } from "web3x/providers";

export class ContentAuthenticator extends Authenticator {
  static DECENTRALAND_ADDRESS: EthAddress = "0x1337e0507eb4ab47e08a179573ed4533d9e22a7b";

  constructor(private readonly decentralandAddress: EthAddress = ContentAuthenticator.DECENTRALAND_ADDRESS) {
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
