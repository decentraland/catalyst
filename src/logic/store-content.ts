import { IContentStorageComponent } from '@dcl/catalyst-storage'
import { Readable } from 'stream'

// How many content files to write to storage at once. They are independent content-addressed objects,
// so storing them in bounded-parallel batches (rather than one awaited PUT at a time) speeds up
// multi-file deploys without an unbounded fan-out.
export const CONTENT_STORE_CONCURRENCY = 10

/**
 * Writes `entries` (hash → stream opener) to storage in bounded-parallel batches. Shared by the vanilla
 * deploy path and the partial-upload staging path so the batched-store logic and its concurrency live in
 * one place. Streams are opened only when their batch starts.
 * @param signal Aborts in-flight writes and skips the remaining batches; rejects with its reason.
 */
export async function storeStreamsInBatches(
  storage: Pick<IContentStorageComponent, 'storeStream'>,
  entries: Array<[string, () => Readable]>,
  signal?: AbortSignal,
  concurrency: number = CONTENT_STORE_CONCURRENCY
): Promise<void> {
  for (let i = 0; i < entries.length; i += concurrency) {
    signal?.throwIfAborted()
    await Promise.all(
      entries.slice(i, i + concurrency).map(async ([hash, openStream]) => {
        const content = openStream()
        try {
          await storage.storeStream(hash, content, signal)
        } finally {
          // A write that failed or was aborted may leave its source open; this releases its file.
          content.destroy()
        }
      })
    )
  }
}
