import { AuthChain, Authenticator, EthAddress, ValidationResult } from 'dcl-crypto'
import { DECENTRALAND_ADDRESS } from 'decentraland-katalyst-commons/addresses'
import { httpProviderForNetwork } from 'decentraland-katalyst-contracts/utils'

export class ContentAuthenticator extends Authenticator {
  constructor(
    private readonly network: string,
    private readonly decentralandAddress: EthAddress = DECENTRALAND_ADDRESS
  ) {
    super()
  }

  /** Return whether the given address used is owned by Decentraland */
  isAddressOwnedByDecentraland(address: EthAddress): boolean {
    return address.toLowerCase() === this.decentralandAddress.toLowerCase()
  }

  /** Validate that the signature belongs to the Ethereum address */
  async validateSignature(
    expectedFinalAuthority: string,
    authChain: AuthChain,
    dateToValidateExpirationInMillis: number
  ): Promise<ValidationResult> {
    return Authenticator.validateSignature(
      expectedFinalAuthority,
      authChain,
      httpProviderForNetwork(this.network),
      dateToValidateExpirationInMillis
    )
  }
}
