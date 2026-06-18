import {
  BLOCK_FETCH_MAX_RETRIES,
  readBlock,
  withBlockFetchRetry
} from '../../../../src/adapters/content-validator/ethereum-provider'

// Make the backoff instant so retry tests don't wait on real timers.
jest.mock('@dcl/snapshots-fetcher/dist/utils', () => ({
  sleep: jest.fn().mockResolvedValue(undefined)
}))

describe('withBlockFetchRetry', () => {
  describe('when the operation succeeds on the first attempt', () => {
    let operation: jest.Mock
    let result: string

    beforeEach(async () => {
      operation = jest.fn().mockResolvedValue('block')
      result = await withBlockFetchRetry(operation)
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    it('should resolve with the operation result', () => {
      expect(result).toBe('block')
    })

    it('should call the operation exactly once', () => {
      expect(operation).toHaveBeenCalledTimes(1)
    })
  })

  describe('when the operation fails once and then succeeds', () => {
    let operation: jest.Mock
    let result: string

    beforeEach(async () => {
      operation = jest.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce('block')
      result = await withBlockFetchRetry(operation)
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    it('should resolve with the eventual success value', () => {
      expect(result).toBe('block')
    })

    it('should retry once before succeeding', () => {
      expect(operation).toHaveBeenCalledTimes(2)
    })
  })

  describe('when the operation fails on every attempt', () => {
    let operation: jest.Mock
    let caughtError: Error | undefined

    beforeEach(async () => {
      operation = jest.fn().mockRejectedValue(new Error('persistent rpc failure'))
      caughtError = undefined
      try {
        await withBlockFetchRetry(operation)
      } catch (err) {
        caughtError = err as Error
      }
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    it('should reject with the last error', () => {
      expect(caughtError?.message).toBe('persistent rpc failure')
    })

    it('should attempt the operation BLOCK_FETCH_MAX_RETRIES times', () => {
      expect(operation).toHaveBeenCalledTimes(BLOCK_FETCH_MAX_RETRIES)
    })
  })
})

describe('readBlock', () => {
  describe('when the RPC returns a block with a timestamp', () => {
    let reqMan: { eth_getBlockByNumber: jest.Mock }
    let result: { timestamp: string | number }

    beforeEach(async () => {
      reqMan = { eth_getBlockByNumber: jest.fn().mockResolvedValue({ timestamp: 123 }) }
      result = await readBlock(reqMan, 88544241)
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    it('should resolve with the returned block', () => {
      expect(result).toEqual({ timestamp: 123 })
    })
  })

  describe('when the RPC returns an empty result', () => {
    let reqMan: { eth_getBlockByNumber: jest.Mock }
    let caughtError: Error | undefined

    beforeEach(async () => {
      reqMan = { eth_getBlockByNumber: jest.fn().mockResolvedValue(null) }
      caughtError = undefined
      try {
        await readBlock(reqMan, 88544241)
      } catch (err) {
        caughtError = err as Error
      }
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    it('should throw a "could not be retrieved" error naming the block', () => {
      expect(caughtError?.message).toBe('Block 88544241 could not be retrieved')
    })
  })

  describe('and an empty result is followed by a block when retried together', () => {
    let reqMan: { eth_getBlockByNumber: jest.Mock }
    let result: { timestamp: string | number }

    beforeEach(async () => {
      reqMan = {
        eth_getBlockByNumber: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ timestamp: 456 })
      }
      result = await withBlockFetchRetry(() => readBlock(reqMan, 88544241))
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    it('should recover and resolve with the block once the RPC returns it', () => {
      expect(result).toEqual({ timestamp: 456 })
    })

    it('should have queried the RPC twice', () => {
      expect(reqMan.eth_getBlockByNumber).toHaveBeenCalledTimes(2)
    })
  })
})
