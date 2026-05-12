import { hashV0, hashV1 } from '@dcl/hashing'
import { IHashing } from './types'

export function createHashing(): IHashing {
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
    }
  }
}
