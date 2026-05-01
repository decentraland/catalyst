import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import { buildDeployData, EntityCombo } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resource-path'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('GET /contents/:hashId', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  describe('when the content file does not exist', () => {
    it('should respond with a 404 status for both GET and HEAD methods', async () => {
      const [getRes, headRes] = await Promise.all([
        fetch(`${server.getUrl()}/contents/non-existent-file`),
        fetch(`${server.getUrl()}/contents/non-existent-file`, { method: 'HEAD' })
      ])
      expect(getRes.status).toBe(404)
      expect(headRes.status).toBe(404)
    })

    describe('and a range header is provided', () => {
      it('should respond with a 404 status, not 416', async () => {
        const res = await fetch(`${server.getUrl()}/contents/non-existent-file`, {
          headers: { Range: 'bytes=0-99' }
        })
        expect(res.status).toBe(404)
      })
    })
  })

  describe('when the content file exists', () => {
    let entityCombo: EntityCombo
    let fileHash: string
    let fileBuffer: Buffer

    beforeEach(async () => {
      await resetServer(server)
      entityCombo = await buildDeployData(['X0,Y0'], {
        metadata: { a: 'metadata' },
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })
      await server.deployEntity(entityCombo.deployData)
      const contentEntry = entityCombo.entity.content!.find((c) => c.file === 'some-binary-file.png')!
      fileHash = contentEntry.hash
      fileBuffer = Buffer.from(entityCombo.deployData.files.get(fileHash)!)
    })

    describe('and no range header is provided', () => {
      it('should respond with a 200 status, full content, Accept-Ranges, and CORS expose headers', async () => {
        const res = await fetch(`${server.getUrl()}/contents/${fileHash}`)
        const body = await res.buffer()
        expect(res.status).toBe(200)
        expect(res.headers.get('accept-ranges')).toBe('bytes')
        expect(body.length).toBe(fileBuffer.length)
        const exposed = res.headers.get('access-control-expose-headers')
        expect(exposed).toContain('Content-Range')
        expect(exposed).toContain('Accept-Ranges')
      })
    })

    describe('and a valid range header is provided', () => {
      it('should respond with a 206 status, correct Content-Range, Content-Length, ETag, and only the requested bytes', async () => {
        const [fullRes, rangeRes] = await Promise.all([
          fetch(`${server.getUrl()}/contents/${fileHash}`),
          fetch(`${server.getUrl()}/contents/${fileHash}`, {
            headers: { Range: 'bytes=0-99' }
          })
        ])
        const body = await rangeRes.buffer()
        expect(rangeRes.status).toBe(206)
        expect(rangeRes.headers.get('content-range')).toBe(`bytes 0-99/${fileBuffer.length}`)
        expect(rangeRes.headers.get('content-length')).toBe('100')
        expect(body.length).toBe(100)
        expect(body).toEqual(fileBuffer.slice(0, 100))
        expect(rangeRes.headers.get('etag')).toBe(fullRes.headers.get('etag'))
      })

      describe('and the range starts from a middle offset', () => {
        it('should return the correct byte slice', async () => {
          const start = 100
          const end = 199
          const res = await fetch(`${server.getUrl()}/contents/${fileHash}`, {
            headers: { Range: `bytes=${start}-${end}` }
          })
          const body = await res.buffer()
          expect(res.status).toBe(206)
          expect(body.length).toBe(100)
          expect(body).toEqual(fileBuffer.slice(start, end + 1))
        })
      })

      describe('and the range omits the end', () => {
        it('should return from start to the end of the file', async () => {
          const start = fileBuffer.length - 50
          const res = await fetch(`${server.getUrl()}/contents/${fileHash}`, {
            headers: { Range: `bytes=${start}-` }
          })
          const body = await res.buffer()
          expect(res.status).toBe(206)
          expect(body.length).toBe(50)
          expect(body).toEqual(fileBuffer.slice(start))
        })
      })

      describe('and a suffix range is provided', () => {
        it('should return the last N bytes of the file', async () => {
          const res = await fetch(`${server.getUrl()}/contents/${fileHash}`, {
            headers: { Range: 'bytes=-50' }
          })
          const body = await res.buffer()
          expect(res.status).toBe(206)
          expect(body.length).toBe(50)
          expect(body).toEqual(fileBuffer.slice(fileBuffer.length - 50))
        })
      })
    })

    describe('and the range exceeds the file size', () => {
      it('should respond with a 416 status, the Content-Range header, and CORS expose headers', async () => {
        const res = await fetch(`${server.getUrl()}/contents/${fileHash}`, {
          headers: { Range: `bytes=${fileBuffer.length + 100}-${fileBuffer.length + 200}` }
        })
        expect(res.status).toBe(416)
        expect(res.headers.get('content-range')).toBe(`bytes */${fileBuffer.length}`)
        expect(res.headers.get('access-control-expose-headers')).toContain('Content-Range')
      })
    })

    describe('and an invalid range header is provided', () => {
      it('should fall back to a 200 status with the full content', async () => {
        const res = await fetch(`${server.getUrl()}/contents/${fileHash}`, {
          headers: { Range: 'invalid-range' }
        })
        expect(res.status).toBe(200)
      })
    })

    describe('and the request method is HEAD', () => {
      it('should respond with a 200 status, the Accept-Ranges header, and no body', async () => {
        const res = await fetch(`${server.getUrl()}/contents/${fileHash}`, { method: 'HEAD' })
        const body = await res.buffer()
        expect(res.status).toBe(200)
        expect(res.headers.get('accept-ranges')).toBe('bytes')
        expect(body.length).toBe(0)
      })

      describe('and a valid range header is provided', () => {
        it('should respond with a 206 status, the Content-Range header, and no body', async () => {
          const res = await fetch(`${server.getUrl()}/contents/${fileHash}`, {
            method: 'HEAD',
            headers: { Range: 'bytes=0-99' }
          })
          const body = await res.buffer()
          expect(res.status).toBe(206)
          expect(res.headers.get('content-range')).toBe(`bytes 0-99/${fileBuffer.length}`)
          expect(body.length).toBe(0)
        })
      })

      describe('and an unsatisfiable range header is provided', () => {
        it('should respond with a 416 status, the Content-Range header, and no body', async () => {
          const res = await fetch(`${server.getUrl()}/contents/${fileHash}`, {
            method: 'HEAD',
            headers: { Range: `bytes=${fileBuffer.length + 100}-${fileBuffer.length + 200}` }
          })
          const body = await res.buffer()
          expect(res.status).toBe(416)
          expect(res.headers.get('content-range')).toBe(`bytes */${fileBuffer.length}`)
          expect(body.length).toBe(0)
        })
      })
    })
  })
})
