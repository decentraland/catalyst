import { AuthChain, EthAddress, ValidationResult } from '@dcl/crypto'

export interface IAuthenticator {
  /** Return whether the given address used is owned by Decentraland */
  isAddressOwnedByDecentraland(address: EthAddress): boolean
  /** Validate that the signature belongs to the Ethereum address */
  validateSignature(
    expectedFinalAuthority: string,
    authChain: AuthChain,
    dateToValidateExpirationInMillis: number
  ): Promise<ValidationResult>
}
