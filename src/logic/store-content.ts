import { IContentStorageComponent } from '@dcl/catalyst-storage'
import { bufferToStream } from '@dcl/catalyst-storage/dist/content-item'

// How many content files to write to storage at once. They are independent content-addressed objects,
// so storing them in bounded-parallel batches (rather than one awaited PUT at a time) speeds up
// multi-file deploys without an unbounded fan-out.
export const CONTENT_STORE_CONCURRENCY = 10

/**
 * Writes `entries` (hash → bytes) to storage in bounded-parallel batches. Shared by the vanilla deploy
 * path and the partial-upload staging path so the batched-store logic and its concurrency live in one
 * place.
 */
export async function storeStreamsInBatches(
  storage: Pick<IContentStorageComponent, 'storeStream'>,
  entries: Array<[string, Uint8Array]>,
  concurrency: number = CONTENT_STORE_CONCURRENCY
): Promise<void> {
  for (let i = 0; i < entries.length; i += concurrency) {
    await Promise.all(
      entries.slice(i, i + concurrency).map(([hash, content]) => storage.storeStream(hash, bufferToStream(content)))
    )
  }
}
