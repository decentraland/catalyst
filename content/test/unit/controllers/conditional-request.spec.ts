import { ContentItem, IContentStorageComponent } from '@dcl/catalyst-storage'
import { Readable } from 'stream'
import { HandlerContextWithPath } from '../../../src/types'
import { getContentHandler } from '../../../src/controller/handlers/get-content-handler'
import { getEntityImageHandler } from '../../../src/controller/handlers/get-entity-image-handler'
import { getEntityThumbnailHandler } from '../../../src/controller/handlers/get-entity-thumbnail-handler'

function createMockContentItem(size: number = 100): ContentItem {
  return {
    size,
    encoding: null,
    contentSize: size,
    asStream: jest.fn().mockResolvedValue(Readable.from(Buffer.alloc(size))),
    asRawStream: jest.fn().mockResolvedValue(Readable.from(Buffer.alloc(size)))
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

function createMockHeaders(entries: Record<string, string> = {}): Headers {
  return {
    get: jest.fn((key: string) => entries[key.toLowerCase()] ?? null)
  } as unknown as Headers
}

describe('conditional request support', () => {
  const hashId = 'QmSomeHash123'
  const etag = JSON.stringify(hashId)
  let contentItem: ContentItem
  let storage: IContentStorageComponent

  beforeEach(() => {
    contentItem = createMockContentItem(500)
    storage = createMockStorage({
      fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
      retrieve: jest.fn().mockResolvedValue(contentItem)
    })
  })

  describe('getContentHandler', () => {
    let context: HandlerContextWithPath<'storage', '/contents/:hashId'>

    describe('when the If-None-Match header matches the ETag', () => {
      beforeEach(() => {
        context = {
          params: { hashId },
          components: { storage },
          url: new URL('http://localhost/contents/' + hashId),
          request: {
            method: 'GET',
            headers: createMockHeaders({ 'if-none-match': etag })
          }
        } as unknown as HandlerContextWithPath<'storage', '/contents/:hashId'>
      })

      it('should return 304 with no body', async () => {
        const response = await getContentHandler(context)
        expect(response.status).toBe(304)
        expect(response).not.toHaveProperty('body')
      })

      it('should include headers in the 304 response', async () => {
        const response = await getContentHandler(context)
        expect(response.headers).toBeDefined()
        expect(response.headers['ETag']).toBe(etag)
      })
    })

    describe('when the If-None-Match header does not match the ETag', () => {
      beforeEach(() => {
        context = {
          params: { hashId },
          components: { storage },
          url: new URL('http://localhost/contents/' + hashId),
          request: {
            method: 'GET',
            headers: createMockHeaders({ 'if-none-match': '"different-hash"' })
          }
        } as unknown as HandlerContextWithPath<'storage', '/contents/:hashId'>
      })

      it('should return the full response', async () => {
        const response = await getContentHandler(context)
        expect(response.status).toBe(200)
        expect(response).toHaveProperty('body')
      })
    })

    describe('when no If-None-Match header is present', () => {
      beforeEach(() => {
        context = {
          params: { hashId },
          components: { storage },
          url: new URL('http://localhost/contents/' + hashId),
          request: {
            method: 'GET',
            headers: createMockHeaders({})
          }
        } as unknown as HandlerContextWithPath<'storage', '/contents/:hashId'>
      })

      it('should return the full response', async () => {
        const response = await getContentHandler(context)
        expect(response.status).toBe(200)
        expect(response).toHaveProperty('body')
      })
    })
  })

  describe('getEntityImageHandler', () => {
    let context: HandlerContextWithPath<'activeEntities' | 'database' | 'storage', '/entities/active/entity/:pointer/image'>

    describe('when the If-None-Match header matches the ETag', () => {
      beforeEach(() => {
        const entity = {
          id: 'entity-id',
          type: 'profile',
          pointers: ['0x1'],
          timestamp: 1000,
          content: [{ file: 'image.png', hash: hashId }],
          metadata: {
            image: 'image.png'
          }
        }

        context = {
          params: { pointer: '0x1' },
          components: {
            storage,
            activeEntities: {
              withPrefix: jest.fn(),
              withIds: jest.fn(),
              withPointers: jest.fn().mockResolvedValue([entity]),
              clear: jest.fn()
            },
            database: {
              queryWithValues: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
            }
          },
          url: new URL('http://localhost/entities/active/entity/0x1/image'),
          request: {
            method: 'GET',
            headers: createMockHeaders({ 'if-none-match': etag })
          }
        } as unknown as HandlerContextWithPath<
          'activeEntities' | 'database' | 'storage',
          '/entities/active/entity/:pointer/image'
        >
      })

      it('should return 304 with no body', async () => {
        const response = await getEntityImageHandler(context)
        expect(response.status).toBe(304)
        expect(response).not.toHaveProperty('body')
      })
    })
  })

  describe('getEntityThumbnailHandler', () => {
    let context: HandlerContextWithPath<
      'database' | 'activeEntities' | 'storage',
      '/entities/active/entity/:pointer/thumbnail'
    >

    describe('when the If-None-Match header matches the ETag', () => {
      beforeEach(() => {
        const entity = {
          id: 'entity-id',
          type: 'scene',
          pointers: ['0,0'],
          timestamp: 1000,
          content: [{ file: 'thumbnail.png', hash: hashId }],
          metadata: {
            thumbnail: 'thumbnail.png'
          }
        }

        context = {
          params: { pointer: '0,0' },
          components: {
            storage,
            activeEntities: {
              withPrefix: jest.fn(),
              withIds: jest.fn(),
              withPointers: jest.fn().mockResolvedValue([entity]),
              clear: jest.fn()
            },
            database: {
              queryWithValues: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
            }
          },
          url: new URL('http://localhost/entities/active/entity/0,0/thumbnail'),
          request: {
            method: 'GET',
            headers: createMockHeaders({ 'if-none-match': etag })
          }
        } as unknown as HandlerContextWithPath<
          'database' | 'activeEntities' | 'storage',
          '/entities/active/entity/:pointer/thumbnail'
        >
      })

      it('should return 304 with no body', async () => {
        const response = await getEntityThumbnailHandler(context)
        expect(response.status).toBe(304)
        expect(response).not.toHaveProperty('body')
      })
    })
  })
})
