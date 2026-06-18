import { EthereumProvider } from '@dcl/block-indexer'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import RequestManager, { HTTPProvider } from 'eth-connect'

// Block lookups during validation hit a single RPC provider that has no built-in retry. A
// transient RPC error, or a momentarily-lagging replica that hasn't indexed the block yet,
// would otherwise fail an otherwise-valid deployment with "Block <N> could not be retrieved".
// This bounded retry is composed below the block-indexer LRU cache (see createEthereumProvider),
// so it only runs on an actual cache-miss RPC call — cache hits are unaffected.
export const BLOCK_FETCH_MAX_RETRIES = 3
const BLOCK_FETCH_BASE_DELAY_MS = 100

export async function withBlockFetchRetry<T>(
  operation: () => Promise<T>,
  onRetry?: (attempt: number, error: unknown) => void
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= BLOCK_FETCH_MAX_RETRIES; attempt++) {
    try {
      return await operation()
    } catch (err) {
      lastError = err
      if (attempt < BLOCK_FETCH_MAX_RETRIES) {
        // Notify before backing off so callers can observe how often the RPC is being retried
        // (a chronically flaky provider otherwise only shows up as latency).
        onRetry?.(attempt, err)
        // Exponential backoff with full jitter to avoid synchronized retries across the
        // many block lookups that concurrent validations issue at once.
        const base = BLOCK_FETCH_BASE_DELAY_MS * 2 ** (attempt - 1)
        await sleep(base + Math.floor(Math.random() * base))
      }
    }
  }
  throw lastError
}

/**
 * Reads a block's timestamp via the RPC. Throws on an empty result — the symptom actually seen
 * in production, where the RPC returned nothing for a recent block — so that withBlockFetchRetry
 * treats it as a retryable attempt instead of a hard failure on the first miss. Exported for tests.
 */
export async function readBlock(
  reqMan: { eth_getBlockByNumber(block: number, returnTransactionObjects: boolean): Promise<unknown> },
  block: number
): Promise<{ timestamp: string | number }> {
  const result = (await reqMan.eth_getBlockByNumber(block, false)) as { timestamp: string | number } | null
  if (result == null || result.timestamp == null) {
    throw new Error(`Block ${block} could not be retrieved`)
  }
  return result
}

/**
 * Reads the current block number, throwing on an empty result so withBlockFetchRetry treats it as
 * a retryable attempt (mirrors readBlock for the binary search's upper bound). Exported for tests.
 */
export async function readBlockNumber(reqMan: { eth_blockNumber(): Promise<unknown> }): Promise<number> {
  const blockNumber = (await reqMan.eth_blockNumber()) as number | null
  if (blockNumber == null) {
    throw new Error('Block number could not be retrieved')
  }
  return blockNumber
}

export const createEthereumProvider = (
  httpProvider: HTTPProvider,
  onRetry?: (attempt: number, error: unknown) => void
): EthereumProvider => {
  const reqMan = new RequestManager(httpProvider)
  return {
    getBlockNumber: async (): Promise<number> => {
      return withBlockFetchRetry(() => readBlockNumber(reqMan), onRetry)
    },
    getBlock: async (block: number): Promise<{ timestamp: string | number }> => {
      return withBlockFetchRetry(() => readBlock(reqMan, block), onRetry)
    }
  }
}
