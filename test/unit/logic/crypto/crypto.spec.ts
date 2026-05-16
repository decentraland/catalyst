import { EthAddress } from '@dcl/crypto'
import { hashV0, hashV1 } from '@dcl/hashing'
import { HTTPProvider } from 'eth-connect'
import { createCrypto, ICrypto } from '../../../../src/logic/crypto'

const DECENTRALAND_ADDRESS: EthAddress = '0x1337e0507eb4ab47e08a179573ed4533d9e22a7b'

function buildCrypto(): ICrypto {
  const provider = new HTTPProvider('https://rpc.decentraland.org/mainnet?project=catalyst-ci')
  return createCrypto(provider, [DECENTRALAND_ADDRESS])
}

describe('when hashing files', () => {
  let crypto: ICrypto
  let firstFile: Uint8Array
  let secondFile: Uint8Array

  beforeEach(() => {
    crypto = buildCrypto()
    firstFile = new Uint8Array(Buffer.from('the first file'))
    secondFile = new Uint8Array(Buffer.from('a different file'))
  })

  describe('and asking for IPFS hashes', () => {
    it('should return one entry per file', async () => {
      const result = await crypto.calculateIPFSHashes([firstFile, secondFile])
      expect(result).toHaveLength(2)
    })

    it('should pair each input file with its v1 hash', async () => {
      const result = await crypto.calculateIPFSHashes([firstFile])
      const expected = await hashV1(firstFile)
      expect(result[0]).toEqual({ file: firstFile, hash: expected })
    })

    describe('and the file list is empty', () => {
      it('should return an empty array', async () => {
        expect(await crypto.calculateIPFSHashes([])).toEqual([])
      })
    })
  })

  describe('and asking for deprecated hashes', () => {
    it('should pair each input file with its v0 hash', async () => {
      const result = await crypto.calculateDeprecatedHashes([firstFile])
      const expected = await hashV0(firstFile)
      expect(result[0]).toEqual({ file: firstFile, hash: expected })
    })

    it('should return a different hash than the IPFS v1 hash for the same file', async () => {
      const [{ hash: deprecatedHash }] = await crypto.calculateDeprecatedHashes([firstFile])
      const [{ hash: ipfsHash }] = await crypto.calculateIPFSHashes([firstFile])
      expect(deprecatedHash).not.toEqual(ipfsHash)
    })
  })
})

describe('when checking whether an address is owned by Decentraland', () => {
  let crypto: ICrypto

  beforeEach(() => {
    crypto = buildCrypto()
  })

  describe('and the address matches one of the configured Decentraland addresses', () => {
    it('should return true regardless of case', () => {
      expect(crypto.isAddressOwnedByDecentraland(DECENTRALAND_ADDRESS)).toBe(true)
      expect(crypto.isAddressOwnedByDecentraland(DECENTRALAND_ADDRESS.toUpperCase())).toBe(true)
    })
  })

  describe('and the address is not in the configured list', () => {
    it('should return false', () => {
      expect(crypto.isAddressOwnedByDecentraland('0x0000000000000000000000000000000000000001')).toBe(false)
    })
  })
})
