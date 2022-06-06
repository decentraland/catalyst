import { AuthChain, Authenticator, EthAddress, ValidationResult } from '@dcl/crypto'
import { HTTPProvider } from 'eth-connect'

export class ContentAuthenticator {
  constructor(private readonly provider: HTTPProvider, private readonly decentralandAddress: EthAddress) {}

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
      this.provider,
      dateToValidateExpirationInMillis
    )
  }
}
