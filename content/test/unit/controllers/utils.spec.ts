import { ContentItem, IContentStorageComponent } from '@dcl/catalyst-storage'
import { checkNotModified, parseRangeHeader, retrieveContentWithRange } from '../../../src/controller/utils'
import { createContentItemMock } from '../../mocks/content-item-mock'
import { createStorageComponentMock } from '../../mocks/storage-component-mock'
import { createRequestMock } from '../../mocks/request-mock'

describe('when checking for not modified', () => {
  const hash = 'bafybeiasb5vpmaounyilfuxbd3lool'

  let expectedHeaders: Record<string, string>

  beforeEach(() => {
    expectedHeaders = {
      ETag: JSON.stringify(hash),
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
      expect(checkNotModified(createRequestMock({ 'If-None-Match': JSON.stringify(hash) }), hash)).toEqual({
        status: 304,
        headers: expectedHeaders
      })
    })
  })

  describe('when the If-None-Match header does not match the ETag', () => {
    it('should return undefined', () => {
      expect(
        checkNotModified(createRequestMock({ 'If-None-Match': JSON.stringify('other-hash') }), hash)
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
      const multiValue = `"other-hash", ${JSON.stringify(hash)}, "another-hash"`
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
        checkNotModified(createRequestMock({ 'If-None-Match': `W/${JSON.stringify(hash)}` }), hash)
      ).toEqual({
        status: 304,
        headers: expectedHeaders
      })
    })
  })
})

describe('when parsing a range header', () => {
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
