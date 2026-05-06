import { ContentItem, IContentStorageComponent } from '@dcl/catalyst-storage'
import { HandlerContextWithPath } from '../../../src/types'
import { getContentHandler } from '../../../src/controllers/handlers/get-content-handler'
import { getEntityImageHandler } from '../../../src/controllers/handlers/get-entity-image-handler'
import { getEntityThumbnailHandler } from '../../../src/controllers/handlers/get-entity-thumbnail-handler'
import { toETag } from '../../../src/controllers/utils'
import { createContentItemMock } from '../../mocks/content-item-mock'
import { createStorageComponentMock } from '../../mocks/storage-component-mock'
import { createRequestMock } from '../../mocks/request-mock'

describe('when handling conditional requests', () => {
  const hashId = 'QmSomeHash123'
  const etag = toETag(hashId)

  let contentItem: ContentItem
  let storage: IContentStorageComponent

  beforeEach(() => {
    contentItem = createContentItemMock(500)
    storage = createStorageComponentMock({
      exist: jest.fn().mockResolvedValue(true),
      fileInfo: jest.fn().mockResolvedValue({ size: 500, encoding: null, contentSize: 500 }),
      retrieve: jest.fn().mockResolvedValue(contentItem)
    })
  })

  describe('when serving content by hash', () => {
    let context: HandlerContextWithPath<'storage', '/contents/:hashId'>

    describe('when the If-None-Match header matches the ETag', () => {
      beforeEach(() => {
        context = {
          params: { hashId },
          components: { storage },
          url: new URL('http://localhost/contents/' + hashId),
          request: {
            method: 'GET',
            ...createRequestMock({ 'if-none-match': etag })
          }
        } as unknown as HandlerContextWithPath<'storage', '/contents/:hashId'>
      })

      it('should return 304 with no body', async () => {
        const response = await getContentHandler(context)
        expect(response.status).toBe(304)
        expect(response).not.toHaveProperty('body')
      })

      it('should include ETag in the 304 response headers', async () => {
        const response = await getContentHandler(context)
        expect(response.headers).toBeDefined()
        expect(response.headers['ETag']).toBe(etag)
      })

      it('should not call storage.retrieve', async () => {
        await getContentHandler(context)
        expect(storage.retrieve).not.toHaveBeenCalled()
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
            ...createRequestMock({ 'if-none-match': '"different-hash"' })
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
            ...createRequestMock()
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

  describe('when serving an entity image', () => {
    let context: HandlerContextWithPath<
      'activeEntities' | 'database' | 'storage',
      '/entities/active/entity/:pointer/image'
    >

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
            ...createRequestMock({ 'if-none-match': etag })
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

      it('should not call storage.retrieve', async () => {
        await getEntityImageHandler(context)
        expect(storage.retrieve).not.toHaveBeenCalled()
      })
    })
  })

  describe('when serving an entity thumbnail', () => {
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
            ...createRequestMock({ 'if-none-match': etag })
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

      it('should not call storage.retrieve', async () => {
        await getEntityThumbnailHandler(context)
        expect(storage.retrieve).not.toHaveBeenCalled()
      })
    })
  })
})
