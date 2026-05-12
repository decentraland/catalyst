import { hashV0, hashV1 } from '@dcl/hashing'
import { createHashing, IHashing } from '../../../../src/logic/hashing'

describe('when hashing files', () => {
  let hashing: IHashing
  let firstFile: Uint8Array
  let secondFile: Uint8Array

  beforeEach(() => {
    hashing = createHashing()
    firstFile = new Uint8Array(Buffer.from('the first file'))
    secondFile = new Uint8Array(Buffer.from('a different file'))
  })

  describe('and asking for IPFS hashes', () => {
    it('should return one entry per file', async () => {
      const result = await hashing.calculateIPFSHashes([firstFile, secondFile])
      expect(result).toHaveLength(2)
    })

    it('should pair each input file with its v1 hash', async () => {
      const result = await hashing.calculateIPFSHashes([firstFile])
      const expected = await hashV1(firstFile)
      expect(result[0]).toEqual({ file: firstFile, hash: expected })
    })

    describe('and the file list is empty', () => {
      it('should return an empty array', async () => {
        expect(await hashing.calculateIPFSHashes([])).toEqual([])
      })
    })
  })

  describe('and asking for deprecated hashes', () => {
    it('should pair each input file with its v0 hash', async () => {
      const result = await hashing.calculateDeprecatedHashes([firstFile])
      const expected = await hashV0(firstFile)
      expect(result[0]).toEqual({ file: firstFile, hash: expected })
    })

    it('should return a different hash than the IPFS v1 hash for the same file', async () => {
      const [{ hash: deprecatedHash }] = await hashing.calculateDeprecatedHashes([firstFile])
      const [{ hash: ipfsHash }] = await hashing.calculateIPFSHashes([firstFile])
      expect(deprecatedHash).not.toEqual(ipfsHash)
    })
  })
})
