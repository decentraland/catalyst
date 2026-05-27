import { Authenticator, EthAddress } from '@dcl/crypto'
import { hashV0, hashV1 } from '@dcl/hashing'
import { HTTPProvider } from 'eth-connect'
import { ICrypto } from './types'

export function createCrypto(provider: HTTPProvider, decentralandAddresses: EthAddress[]): ICrypto {
  const lowercased = decentralandAddresses.map((a) => a.toLowerCase())
  return {
    async calculateIPFSHashes<T extends Uint8Array>(files: T[]): Promise<{ hash: string; file: T }[]> {
      const entries = Array.from(files).map(async (file) => ({
        hash: await hashV1(file),
        file
      }))
      return Promise.all(entries)
    },
    async calculateDeprecatedHashes<T extends Uint8Array>(files: T[]): Promise<{ hash: string; file: T }[]> {
      const entries = Array.from(files).map(async (file) => ({
        hash: await hashV0(file),
        file
      }))
      return Promise.all(entries)
    },
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
