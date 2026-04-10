import { ContentItem, IContentStorageComponent } from '@dcl/catalyst-storage'
import { Readable } from 'stream'
import { parseRangeHeader, retrieveContentWithRange } from '../../../src/controller/utils'

function createMockContentItem(size: number | null = 100, encoding: string | null = null): ContentItem {
  return {
    size,
    encoding,
    asStream: jest.fn().mockResolvedValue(Readable.from(Buffer.alloc(size ?? 0))),
    asRawStream: jest.fn().mockResolvedValue(Readable.from(Buffer.alloc(size ?? 0)))
  }
}

function createMockStorage(overrides: Partial<IContentStorageComponent> = {}): IContentStorageComponent {
  return {
    storeStream: jest.fn(),
    storeStreamAndCompress: jest.fn(),
    delete: jest.fn(),
    retrieve: jest.fn(),
    fileInfo: jest.fn(),
    fileInfoMultiple: jest.fn(),
    exist: jest.fn(),
    existMultiple: jest.fn(),
    allFileIds: jest.fn(),
    ...overrides
  }
}

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

  describe('when the range header has an invalid format', () => {
    it('should return undefined', () => {
      expect(parseRangeHeader('invalid', 1000)).toBeUndefined()
    })
  })

  describe('when the range header uses an unsupported unit', () => {
    it('should return undefined', () => {
      expect(parseRangeHeader('chars=0-99', 1000)).toBeUndefined()
    })
  })

  describe('when the start is greater than the end', () => {
    it('should return unsatisfiable', () => {
      expect(parseRangeHeader('bytes=500-100', 1000)).toEqual({ type: 'unsatisfiable' })
    })
  })

  describe('when the start is equal to the total size', () => {
    it('should return unsatisfiable', () => {
      expect(parseRangeHeader('bytes=1000-1000', 1000)).toEqual({ type: 'unsatisfiable' })
    })
  })

  describe('when the start exceeds the total size', () => {
    it('should return unsatisfiable', () => {
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
    it('should return the last N bytes', () => {
      expect(parseRangeHeader('bytes=-500', 1000)).toEqual({ type: 'range', start: 500, end: 999 })
    })
  })

  describe('when a suffix range exceeds the total size', () => {
    it('should clamp start to 0', () => {
      expect(parseRangeHeader('bytes=-2000', 1000)).toEqual({ type: 'range', start: 0, end: 999 })
    })
  })

  describe('when a suffix range of zero is provided', () => {
    it('should return unsatisfiable', () => {
      expect(parseRangeHeader('bytes=-0', 1000)).toEqual({ type: 'unsatisfiable' })
    })
  })

  describe('when a suffix range is provided and the total size is zero', () => {
    it('should return unsatisfiable', () => {
      expect(parseRangeHeader('bytes=-500', 0)).toEqual({ type: 'unsatisfiable' })
    })
  })

  describe('when a suffix range requests the entire file', () => {
    it('should return start 0 to end', () => {
      expect(parseRangeHeader('bytes=-1000', 1000)).toEqual({ type: 'range', start: 0, end: 999 })
    })
  })
})

describe('retrieveContentWithRange', () => {
  let storage: IContentStorageComponent

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when the file does not exist', () => {
    beforeEach(() => {
      storage = createMockStorage({
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
      contentItem = createMockContentItem(500)
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockResolvedValue(contentItem)
      })
    })

    it('should return the full content with status 200', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', null)
      expect(result).toEqual({ content: contentItem, status: 200 })
    })

    it('should call retrieve without a range', async () => {
      await retrieveContentWithRange(storage, 'some-hash', null)
      expect(storage.retrieve).toHaveBeenCalledWith('some-hash')
    })
  })

  describe('when the range header is valid', () => {
    let contentItem: ContentItem

    beforeEach(() => {
      contentItem = createMockContentItem(100)
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockResolvedValue(contentItem)
      })
    })

    it('should return the content with status 206 and the correct headers', async () => {
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
    })

    it('should call retrieve with the parsed range', async () => {
      await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(storage.retrieve).toHaveBeenCalledWith('some-hash', expect.objectContaining({ start: 0, end: 99 }))
    })
  })

  describe('when the range header is valid and the retrieved content has a null size', () => {
    let contentItem: ContentItem

    beforeEach(() => {
      contentItem = createMockContentItem(null)
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockResolvedValue(contentItem)
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
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 })
      })
    })

    it('should return status 416 with the Content-Range header and not call retrieve', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=500-600')
      expect(result!.status).toBe(416)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: {
            'Content-Range': 'bytes */500'
          }
        })
      )
      expect(storage.retrieve).not.toHaveBeenCalled()
    })
  })

  describe('when storage.retrieve returns undefined for a ranged request', () => {
    beforeEach(() => {
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockResolvedValue(undefined)
      })
    })

    it('should return undefined', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(result).toBeUndefined()
    })
  })

  describe('when storage.retrieve returns undefined for a full request', () => {
    beforeEach(() => {
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockResolvedValue(undefined)
      })
    })

    it('should return undefined', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', null)
      expect(result).toBeUndefined()
    })
  })

  describe('when storage.retrieve throws a RangeError', () => {
    beforeEach(() => {
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockRejectedValue(new RangeError('Invalid range: start=0, end=99'))
      })
    })

    it('should return status 416 with the Content-Range header', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(result!.status).toBe(416)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: {
            'Content-Range': 'bytes */500'
          }
        })
      )
    })
  })

  describe('when fileInfo returns contentSize different from size (gzip file)', () => {
    let contentItem: ContentItem

    beforeEach(() => {
      contentItem = createMockContentItem(100)
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 300, encoding: 'gzip', contentSize: 1000 }),
        retrieve: jest.fn().mockResolvedValue(contentItem)
      })
    })

    it('should use contentSize for range validation and Content-Range total', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(result!.status).toBe(206)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: {
            'Content-Range': 'bytes 0-99/1000',
            'Content-Length': '100'
          }
        })
      )
    })

    it('should allow ranges beyond the compressed size', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=500-599')
      expect(result!.status).toBe(206)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: {
            'Content-Range': 'bytes 500-599/1000',
            'Content-Length': '100'
          }
        })
      )
    })
  })

  describe('when fileInfo returns contentSize as null (legacy gzip)', () => {
    let contentItem: ContentItem

    beforeEach(() => {
      contentItem = createMockContentItem(100)
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 300, encoding: 'gzip', contentSize: null }),
        retrieve: jest.fn().mockResolvedValue(contentItem)
      })
    })

    it('should fall back to size for range validation', async () => {
      const result = await retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')
      expect(result!.status).toBe(206)
      expect(result).toEqual(
        expect.objectContaining({
          rangeHeaders: {
            'Content-Range': 'bytes 0-99/300',
            'Content-Length': '100'
          }
        })
      )
    })
  })

  describe('when storage.retrieve throws a non-RangeError', () => {
    let thrownError: Error

    beforeEach(() => {
      thrownError = new Error('Storage failure')
      storage = createMockStorage({
        fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
        retrieve: jest.fn().mockRejectedValue(thrownError)
      })
    })

    it('should rethrow the error', async () => {
      await expect(retrieveContentWithRange(storage, 'some-hash', 'bytes=0-99')).rejects.toThrow(thrownError)
    })
  })
})
