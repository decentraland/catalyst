import { Authenticator, EthAddress } from '@dcl/crypto'
import { HTTPProvider } from 'eth-connect'
import { IAuthenticator } from './types'

export function createAuthenticator(provider: HTTPProvider, decentralandAddresses: EthAddress[]): IAuthenticator {
  const lowercased = decentralandAddresses.map((a) => a.toLowerCase())
  return {
    isAddressOwnedByDecentraland(address) {
      return lowercased.includes(address.toLowerCase())
    },
    async validateSignature(expectedFinalAuthority, authChain, dateToValidateExpirationInMillis) {
      return Authenticator.validateSignature(
        expectedFinalAuthority,
        authChain,
        provider,
        dateToValidateExpirationInMillis
      )
    }
  }
}
