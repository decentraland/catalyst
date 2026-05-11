import { ContentItem, IContentStorageComponent } from '@dcl/catalyst-storage'
import { Readable } from 'stream'
import {
  checkNotModified,
  observeContentBodySize,
  paginationObject,
  parseRangeHeader,
  retrieveContentWithRange,
  toETag
} from '../../../src/controllers/utils'
import { InvalidRequestError } from '../../../src/controllers/errors'
import { createContentItemMock } from '../../mocks/content-item-mock'
import { createStorageComponentMock } from '../../mocks/storage-component-mock'
import { createRequestMock } from '../../mocks/request-mock'

describe('when checking for not modified', () => {
  const hash = 'bafybeiasb5vpmaounyilfuxbd3lool'

  let expectedHeaders: Record<string, string>

  beforeEach(() => {
    expectedHeaders = {
      ETag: toETag(hash),
      'Cache-Control': 'public,max-age=31536000,s-maxage=31536000,immutable',
      'Access-Control-Expose-Headers': 'ETag'
    }
  })

  describe('when the If-None-Match header is not present', () => {
    it('should return undefined', () => {
      expect(checkNotModified(createRequestMock(), hash)).toBeUndefined()
    })
  })

  describe('when the If-None-Match header matches the ETag exactly', () => {
    it('should return a 304 response', () => {
      expect(checkNotModified(createRequestMock({ 'If-None-Match': toETag(hash) }), hash)).toEqual({
        status: 304,
        headers: expectedHeaders
      })
    })
  })

  describe('when the If-None-Match header does not match the ETag', () => {
    it('should return undefined', () => {
      expect(
        checkNotModified(createRequestMock({ 'If-None-Match': toETag('other-hash') }), hash)
      ).toBeUndefined()
    })
  })

  describe('when the If-None-Match header is the wildcard *', () => {
    it('should return a 304 response', () => {
      expect(checkNotModified(createRequestMock({ 'If-None-Match': '*' }), hash)).toEqual({
        status: 304,
        headers: expectedHeaders
      })
    })
  })

  describe('when the If-None-Match header contains multiple ETags', () => {
    it('should return a 304 response when one matches', () => {
      const multiValue = `"other-hash", ${toETag(hash)}, "another-hash"`
      expect(checkNotModified(createRequestMock({ 'If-None-Match': multiValue }), hash)).toEqual({
        status: 304,
        headers: expectedHeaders
      })
    })

    it('should return undefined when none match', () => {
      expect(
        checkNotModified(createRequestMock({ 'If-None-Match': '"other-hash", "another-hash"' }), hash)
      ).toBeUndefined()
    })
  })

  describe('when the If-None-Match header uses a weak ETag prefix', () => {
    it('should return a 304 response using weak comparison', () => {
      expect(
        checkNotModified(createRequestMock({ 'If-None-Match': `W/${toETag(hash)}` }), hash)
      ).toEqual({
        status: 304,
        headers: expectedHeaders
      })
    })
  })
})

describe('paginationObject', () => {
  function urlWith(params: string): URL {
    return new URL(`https://example.com/path${params}`)
  }

  describe('when pageSize is a non-numeric string', () => {
    it('should throw InvalidRequestError', () => {
      expect(() => paginationObject(urlWith('?pageSize=abc'))).toThrow(InvalidRequestError)
      expect(() => paginationObject(urlWith('?pageSize=abc'))).toThrow('pageSize must be a positive integer')
    })
  })

  describe('when pageNum is a non-numeric string', () => {
    it('should throw InvalidRequestError', () => {
      expect(() => paginationObject(urlWith('?pageNum=abc'))).toThrow(InvalidRequestError)
      expect(() => paginationObject(urlWith('?pageNum=abc'))).toThrow('pageNum must be a positive integer')
    })
  })

  describe('when pageSize is negative', () => {
    it('should throw InvalidRequestError', () => {
      expect(() => paginationObject(urlWith('?pageSize=-5'))).toThrow(InvalidRequestError)
      expect(() => paginationObject(urlWith('?pageSize=-5'))).toThrow('pageSize must be a positive integer')
    })
  })

  describe('when pageNum is negative', () => {
    it('should throw InvalidRequestError', () => {
      expect(() => paginationObject(urlWith('?pageNum=-5'))).toThrow(InvalidRequestError)
      expect(() => paginationObject(urlWith('?pageNum=-5'))).toThrow('pageNum must be a positive integer')
    })
  })

  describe('when pageNum is zero', () => {
    it('should throw InvalidRequestError', () => {
      expect(() => paginationObject(urlWith('?pageNum=0'))).toThrow(InvalidRequestError)
      expect(() => paginationObject(urlWith('?pageNum=0'))).toThrow('pageNum must be a positive integer')
    })
  })

  describe('when pageSize is zero', () => {
    it('should throw InvalidRequestError', () => {
      expect(() => paginationObject(urlWith('?pageSize=0'))).toThrow(InvalidRequestError)
      expect(() => paginationObject(urlWith('?pageSize=0'))).toThrow('pageSize must be a positive integer')
    })
  })

  describe('when valid pagination params are provided', () => {
    it('should return the correct pagination object', () => {
      const result = paginationObject(urlWith('?pageSize=10&pageNum=3'))
      expect(result).toEqual({ pageSize: 10, pageNum: 3, offset: 20, limit: 10 })
    })
  })

  describe('when no params are provided', () => {
    it('should return defaults', () => {
      const result = paginationObject(urlWith(''))
      expect(result).toEqual({ pageSize: 100, pageNum: 1, offset: 0, limit: 100 })
    })
  })
})

describe('parseRangeHeader', () => {
  describe('when the range header is null', () => {
    it('should return undefined', () => {
      expect(parseRangeHeader(null, 1000)).toBeUndefined()
    })
  })

  describe('when the total size is null', () => {
    it('should return undefined', () => {
      expect(parseRangeHeader('bytes=0-99', null)).toBeUndefined()
    })
  })

  describe('when the total size is zero', () => {
    it('should return unsatisfiable', () => {
      expect(parseRangeHeader('bytes=0-99', 0)).toEqual({ type: 'unsatisfiable' })
    })
  })

  describe('when the range header is not a valid byte range', () => {
    it('should return undefined for invalid formats and unsupported units', () => {
      expect(parseRangeHeader('invalid', 1000)).toBeUndefined()
      expect(parseRangeHeader('chars=0-99', 1000)).toBeUndefined()
    })
  })

  describe('when the start is beyond the file boundary', () => {
    it('should return unsatisfiable when start equals or exceeds total size', () => {
      expect(parseRangeHeader('bytes=500-100', 1000)).toEqual({ type: 'unsatisfiable' })
      expect(parseRangeHeader('bytes=1000-1000', 1000)).toEqual({ type: 'unsatisfiable' })
      expect(parseRangeHeader('bytes=1500-2000', 1000)).toEqual({ type: 'unsatisfiable' })
    })
  })

  describe('when the range header specifies both start and end', () => {
    it('should return the parsed range', () => {
      expect(parseRangeHeader('bytes=0-99', 1000)).toEqual({ type: 'range', start: 0, end: 99 })
    })
  })

  describe('when the range header omits the end', () => {
    it('should default the end to totalSize - 1', () => {
      expect(parseRangeHeader('bytes=500-', 1000)).toEqual({ type: 'range', start: 500, end: 999 })
    })
  })

  describe('when the end exceeds the total size', () => {
    it('should clamp the end to totalSize - 1', () => {
      expect(parseRangeHeader('bytes=0-5000', 1000)).toEqual({ type: 'range', start: 0, end: 999 })
    })
  })

  describe('when a suffix range is provided', () => {
    it('should return the last N bytes, clamping start to 0 if suffix exceeds file size', () => {
      expect(parseRangeHeader('bytes=-500', 1000)).toEqual({ type: 'range', start: 500, end: 999 })
      expect(parseRangeHeader('bytes=-1000', 1000)).toEqual({ type: 'range', start: 0, end: 999 })
      expect(parseRangeHeader('bytes=-2000', 1000)).toEqual({ type: 'range', start: 0, end: 999 })
    })
  })

  describe('when a suffix range is unsatisfiable', () => {
    it('should return unsatisfiable for zero suffix or zero total size', () => {
      expect(parseRangeHeader('bytes=-0', 1000)).toEqual({ type: 'unsatisfiable' })
      expect(parseRangeHeader('bytes=-500', 0)).toEqual({ type: 'unsatisfiable' })
    })
  })
})

describe('when retrieving content with range', () => {
  let storage: IContentStorageComponent

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when the file does not exist', () => {
    beforeEach(() => {
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue(undefined)
      })
    })

    it('should return undefined', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', null)
      expect(result).toBeUndefined()
    })
  })

  describe('when there is no range header', () => {
    let contentItem: ContentItem

    beforeEach(() => {
      contentItem = createContentItemMock(500)
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockResolvedValue(contentItem)
      })
    })

    it('should return the full content with status 200 and call retrieve without a range', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', null)
      expect(result).toEqual({ content: contentItem, status: 200 })
      expect(storage.retrieve).toHaveBeenCalledWith('some-hash')
    })
  })

  describe('when the range header is valid', () => {
    let contentItem: ContentItem

    beforeEach(() => {
      contentItem = createContentItemMock(100)
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockResolvedValue(contentItem)
      })
    })

    it('should return status 206 with correct headers and call retrieve with the parsed range', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(result!.status).toBe(206)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: {
            'Content-Range': 'bytes 0-99/500',
            'Content-Length': '100'
          }
        })
      )
      expect(storage.retrieve).toHaveBeenCalledWith('some-hash', expect.objectContaining({ start: 0, end: 99 }))
    })
  })

  describe('when the range header is valid and the retrieved content has a null size', () => {
    beforeEach(() => {
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockResolvedValue(createContentItemMock(null))
      })
    })

    it('should fall back to the computed range length for Content-Length', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: {
            'Content-Range': 'bytes 0-99/500',
            'Content-Length': '100'
          }
        })
      )
    })
  })

  describe('when the range is unsatisfiable', () => {
    beforeEach(() => {
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 })
      })
    })

    it('should return status 416 with Content-Range and CORS headers, and not call retrieve', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=500-600')
      expect(result!.status).toBe(416)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: {
            'Content-Range': 'bytes */500',
            'Access-Control-Expose-Headers': 'Content-Range'
          }
        })
      )
      expect(storage.retrieve).not.toHaveBeenCalled()
    })
  })

  describe('when storage.retrieve returns undefined', () => {
    beforeEach(() => {
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockResolvedValue(undefined)
      })
    })

    it('should return undefined for both ranged and full requests', async () => {
      expect(await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')).toBeUndefined()
      expect(await retrieveContentWithRange(storage, 'some-hash', null)).toBeUndefined()
    })
  })

  describe('when storage.retrieve throws a RangeError', () => {
    beforeEach(() => {
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockRejectedValue(new RangeError('Invalid range: start=0, end=99'))
      })
    })

    it('should return status 416 with Content-Range and CORS headers', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(result!.status).toBe(416)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: {
            'Content-Range': 'bytes */500',
            'Access-Control-Expose-Headers': 'Content-Range'
          }
        })
      )
    })
  })

  describe('when fileInfo returns contentSize different from size (gzip file)', () => {
    beforeEach(() => {
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue({ size: 300, encoding: 'gzip', contentSize: 1000 }),
        retrieve: jest.fn().mockResolvedValue(createContentItemMock(100))
      })
    })

    it('should use contentSize for range validation and allow ranges beyond compressed size', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(result!.status).toBe(206)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: { 'Content-Range': 'bytes 0-99/1000', 'Content-Length': '100' }
        })
      )

      const beyondCompressed = await retrieveContentWithRange(storage, 'some-hash', 'bytes=500-599')
      expect(beyondCompressed!.status).toBe(206)
      expect(beyondCompressed).toEqual(
        expect.objectContaining({
          rangeHeaders: { 'Content-Range': 'bytes 500-599/1000', 'Content-Length': '100' }
        })
      )
    })
  })

  describe('when fileInfo returns contentSize as null (legacy gzip)', () => {
    beforeEach(() => {
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue({ size: 300, encoding: 'gzip', contentSize: null }),
        retrieve: jest.fn().mockResolvedValue(createContentItemMock(100))
      })
    })

    it('should fall back to size for range validation', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(result!.status).toBe(206)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: { 'Content-Range': 'bytes 0-99/300', 'Content-Length': '100' }
        })
      )
    })
  })

  describe('when storage.retrieve throws a non-RangeError', () => {
    let thrownError: Error

    beforeEach(() => {
      thrownError = new Error('Storage failure')
      storage = createStorageComponentMock({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockRejectedValue(thrownError)
      })
    })

    it('should rethrow the error', async () => {
      await expect(retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')).rejects.toThrow(thrownError)
    })
  })
})

describe('when observing content body size', () => {
  const hash = 'bafybeiasb5vpmaounyilfuxbd3lool'
  let metrics: { increment: jest.Mock }
  let logger: { warn: jest.Mock; info: jest.Mock; debug: jest.Mock; error: jest.Mock; log: jest.Mock }
  let logs: { getLogger: jest.Mock }
  let components: any

  // Drain a Readable to completion and resolve with the total bytes.
  const drain = (s: Readable): Promise<number> =>
    new Promise((resolve, reject) => {
      let total = 0
      s.on('data', (chunk: Buffer) => {
        total += chunk.length
      })
      s.on('end', () => resolve(total))
      s.on('close', () => resolve(total))
      s.on('error', reject)
    })

  beforeEach(() => {
    metrics = { increment: jest.fn() }
    logger = {
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      log: jest.fn()
    }
    logs = { getLogger: jest.fn().mockReturnValue(logger) }
    components = { metrics, logs }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and the expected size is null', () => {
    let source: Readable

    beforeEach(() => {
      source = Readable.from(Buffer.alloc(100))
    })

    it('should return the source stream unchanged without instrumenting it', async () => {
      const result = observeContentBodySize(source, null, hash, components)
      expect(result).toBe(source)
      await drain(result)
      expect(metrics.increment).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('and the body matches the expected size', () => {
    let observed: Readable

    beforeEach(async () => {
      const source = Readable.from(Buffer.alloc(100))
      observed = observeContentBodySize(source, 100, hash, components)
      await drain(observed)
    })

    it('should not increment the short-response metric', () => {
      expect(metrics.increment).not.toHaveBeenCalled()
    })

    it('should not emit a warning log', () => {
      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('and the body is shorter than the expected size', () => {
    let observed: Readable

    beforeEach(async () => {
      // 50 bytes streamed against a 100-byte declaration — the truncation case
      const source = Readable.from(Buffer.alloc(50))
      observed = observeContentBodySize(source, 100, hash, components)
      await drain(observed)
    })

    it('should increment the short-response metric with reason=truncated', () => {
      expect(metrics.increment).toHaveBeenCalledWith('dcl_content_short_response_total', {
        reason: 'truncated'
      })
    })

    it('should emit exactly one warning log including the observed and expected sizes', () => {
      expect(logger.warn).toHaveBeenCalledTimes(1)
      const [, payload] = logger.warn.mock.calls[0]
      expect(payload).toMatchObject({ hash, expectedSize: 100, observed: 50, reason: 'truncated' })
    })
  })

  describe('and the body is longer than the expected size', () => {
    let observed: Readable

    beforeEach(async () => {
      // Same mismatch direction is also worth flagging — points at a storage
      // miscount or a doubled-write
      const source = Readable.from(Buffer.alloc(150))
      observed = observeContentBodySize(source, 100, hash, components)
      await drain(observed)
    })

    it('should still increment the short-response metric (the metric tracks "size mismatch", not strictly under)', () => {
      expect(metrics.increment).toHaveBeenCalledWith('dcl_content_short_response_total', {
        reason: 'truncated'
      })
    })
  })

  describe('and the source stream errors mid-transfer', () => {
    let observed: Readable
    let drainError: unknown

    beforeEach(async () => {
      // Custom Readable that emits 30 bytes then errors — exactly the
      // "storage backend gave up partway" case the metric should catch
      const source = new Readable({
        read() {
          this.push(Buffer.alloc(30))
          this.destroy(new Error('upstream connection reset'))
        }
      })
      observed = observeContentBodySize(source, 100, hash, components)
      try {
        await drain(observed)
      } catch (err) {
        drainError = err
      }
    })

    it('should increment the short-response metric with reason=error', () => {
      expect(metrics.increment).toHaveBeenCalledWith('dcl_content_short_response_total', {
        reason: 'error'
      })
    })

    it('should propagate the source error to the wrapped stream rather than swallowing it', () => {
      expect(drainError).toBeInstanceOf(Error)
      expect((drainError as Error).message).toBe('upstream connection reset')
    })
  })
})
