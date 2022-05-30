import { hashV1 } from '@dcl/hashing'

export async function calculateIPFSHashes<T extends Uint8Array>(files: T[]): Promise<{ hash: string; file: T }[]> {
  const entries = Array.from(files).map(async (file) => ({
    hash: await hashV1(file),
    file
  }))
  return Promise.all(entries)
}
