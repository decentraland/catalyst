import { keccak256, zeros } from 'ethereumjs-util'

export type IBloomFilterComponent = {
  add(string: string): void
  check(string: string): boolean
  reset(): void
}

export function createBloomFilterComponent(options: { sizeInBytes?: number }): IBloomFilterComponent {
  /**
   * Represents a Bloom filter.
   */
  const BYTE_SIZE = options.sizeInBytes ?? 256
  const bitvector: Buffer = zeros(BYTE_SIZE)

  return {
    reset() {
      bitvector.fill(0)
    },
    /**
     * Adds an element to a bit vector of a 64 byte bloom filter.
     * @param multihash - The element to add
     */
    add(multihash: string) {
      const e = keccak256(Buffer.from(multihash))
      const mask = 2047 // binary 11111111111
      for (let i = 0; i < 3; i++) {
        const first2bytes = e.readUInt16BE(i * 2)
        const loc = mask & first2bytes
        const byteLoc = loc >> 3
        const bitLoc = 1 << loc % 8
        bitvector[BYTE_SIZE - byteLoc - 1] |= bitLoc
      }
    },

    /**
     * Checks if an element is in the bloom.
     * @param multihash - The element to check
     */
    check(multihash: string): boolean {
      const e = keccak256(Buffer.from(multihash))
      const mask = 2047 // binary 11111111111
      let match = true

      for (let i = 0; i < 3 && match; i++) {
        const first2bytes = e.readUInt16BE(i * 2)
        const loc = mask & first2bytes
        const byteLoc = loc >> 3
        const bitLoc = 1 << loc % 8
        match = (bitvector[BYTE_SIZE - byteLoc - 1] & bitLoc) !== 0
      }

      return Boolean(match)
    }
  }
}
