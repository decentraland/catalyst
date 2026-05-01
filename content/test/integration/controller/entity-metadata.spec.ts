import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import { buildDeployData, EntityCombo } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resource-path'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('GET /queries/items/:pointer/thumbnail', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  beforeEach(() => resetServer(server))

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  describe('when the entity does not exist', () => {
    it('should respond with a 404 status for both GET and HEAD methods', async () => {
      const [getRes, headRes] = await Promise.all([
        fetch(`${server.getUrl()}/queries/items/non-existent/thumbnail`),
        fetch(`${server.getUrl()}/queries/items/non-existent/thumbnail`, { method: 'HEAD' })
      ])
      expect(getRes.status).toBe(404)
      expect(headRes.status).toBe(404)
    })
  })

  describe('when the entity has no metadata', () => {
    beforeEach(async () => {
      const { deployData } = await buildDeployData(['wearable'], {
        metadata: {},
        contentPaths: []
      })
      await server.deployEntity(deployData)
    })

    it('should respond with a 404 status', async () => {
      const res = await fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`)
      expect(res.status).toBe(404)
    })
  })

  describe('when the entity has no thumbnail in metadata', () => {
    beforeEach(async () => {
      const { deployData } = await buildDeployData(['wearable'], {
        metadata: { image: 'some-binary-file.png' },
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      await server.deployEntity(deployData)
    })

    it('should respond with a 404 status', async () => {
      const res = await fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`)
      expect(res.status).toBe(404)
    })
  })

  describe('when the entity has a thumbnail', () => {
    let entityCombo: EntityCombo
    let fileBuffer: Buffer

    beforeEach(async () => {
      entityCombo = await buildDeployData(['wearable'], {
        metadata: { thumbnail: 'some-binary-file.png' },
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      await server.deployEntity(entityCombo.deployData)
      const contentEntry = entityCombo.entity.content!.find((c) => c.file === 'some-binary-file.png')!
      fileBuffer = Buffer.from(entityCombo.deployData.files.get(contentEntry.hash)!)
    })

    describe('and no range header is provided', () => {
      it('should respond with a 200 status, content headers, and the Accept-Ranges header', async () => {
        const res = await fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('etag')).toBeTruthy()
        expect(res.headers.get('cache-control')).toBeTruthy()
        expect(res.headers.get('accept-ranges')).toBe('bytes')
      })
    })

    describe('and a valid range header is provided', () => {
      it('should respond with a 206 status, the Content-Range header, and only the requested bytes', async () => {
        const res = await fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`, {
          headers: { Range: 'bytes=0-99' }
        })
        const body = await res.buffer()
        expect(res.status).toBe(206)
        expect(res.headers.get('content-range')).toBe(`bytes 0-99/${fileBuffer.length}`)
        expect(body.length).toBe(100)
        expect(body).toEqual(fileBuffer.slice(0, 100))
      })
    })

    describe('and the request method is HEAD', () => {
      it('should respond with a 200 status and no body', async () => {
        const res = await fetch(`${server.getUrl()}/queries/items/wearable/thumbnail`, { method: 'HEAD' })
        const body = await res.buffer()
        expect(res.status).toBe(200)
        expect(body.length).toBe(0)
      })
    })
  })
})

describe('GET /queries/items/:pointer/image', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  beforeEach(() => resetServer(server))

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  describe('when the entity does not exist', () => {
    it('should respond with a 404 status for both GET and HEAD methods', async () => {
      const [getRes, headRes] = await Promise.all([
        fetch(`${server.getUrl()}/queries/items/non-existent/image`),
        fetch(`${server.getUrl()}/queries/items/non-existent/image`, { method: 'HEAD' })
      ])
      expect(getRes.status).toBe(404)
      expect(headRes.status).toBe(404)
    })
  })

  describe('when the entity has no image in metadata', () => {
    beforeEach(async () => {
      const { deployData } = await buildDeployData(['wearable'], {
        metadata: { thumbnail: 'some-binary-file.png' },
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      await server.deployEntity(deployData)
    })

    it('should respond with a 404 status', async () => {
      const res = await fetch(`${server.getUrl()}/queries/items/wearable/image`)
      expect(res.status).toBe(404)
    })
  })

  describe('when the entity has an image', () => {
    let entityCombo: EntityCombo
    let fileBuffer: Buffer

    beforeEach(async () => {
      entityCombo = await buildDeployData(['wearable'], {
        metadata: { image: 'some-binary-file.png' },
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      await server.deployEntity(entityCombo.deployData)
      const contentEntry = entityCombo.entity.content!.find((c) => c.file === 'some-binary-file.png')!
      fileBuffer = Buffer.from(entityCombo.deployData.files.get(contentEntry.hash)!)
    })

    describe('and no range header is provided', () => {
      it('should respond with a 200 status, content headers, and the Accept-Ranges header', async () => {
        const res = await fetch(`${server.getUrl()}/queries/items/wearable/image`)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('etag')).toBeTruthy()
        expect(res.headers.get('cache-control')).toBeTruthy()
        expect(res.headers.get('accept-ranges')).toBe('bytes')
      })
    })

    describe('and a valid range header is provided', () => {
      it('should respond with a 206 status, the Content-Range header, and only the requested bytes', async () => {
        const res = await fetch(`${server.getUrl()}/queries/items/wearable/image`, {
          headers: { Range: 'bytes=0-99' }
        })
        const body = await res.buffer()
        expect(res.status).toBe(206)
        expect(res.headers.get('content-range')).toBe(`bytes 0-99/${fileBuffer.length}`)
        expect(body.length).toBe(100)
        expect(body).toEqual(fileBuffer.slice(0, 100))
      })
    })

    describe('and the request method is HEAD', () => {
      it('should respond with a 200 status and no body', async () => {
        const res = await fetch(`${server.getUrl()}/queries/items/wearable/image`, { method: 'HEAD' })
        const body = await res.buffer()
        expect(res.status).toBe(200)
        expect(body.length).toBe(0)
      })
    })
  })
})
