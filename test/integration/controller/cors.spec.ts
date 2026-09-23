import LeakDetector from 'jest-leak-detector'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'

describe('Integration - CORS', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  describe('when preflighting a request that carries the ADR-44 signed-fetch identity headers', () => {
    const requestedHeaders =
      'x-identity-auth-chain-0,x-identity-auth-chain-1,x-identity-auth-chain-2,x-identity-timestamp,x-identity-metadata'
    let response: Response

    beforeEach(async () => {
      response = await fetch(`${server.getUrl()}/available-content?cid=abc`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://play.decentraland.org',
          'access-control-request-method': 'GET',
          'access-control-request-headers': requestedHeaders
        }
      })
    })

    it('should answer the preflight successfully', () => {
      expect(response.status).toBe(204)
    })

    it('should grant every requested identity header', () => {
      expect(response.headers.get('access-control-allow-headers')).toBe(requestedHeaders)
    })

    it('should allow the requested method', () => {
      expect(response.headers.get('access-control-allow-methods')).toContain('GET')
    })

    it('should allow any origin', () => {
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
    })

    it('should vary on the requested headers so a shared cache keys preflights per header set', () => {
      expect(response.headers.get('vary')).toBe('Access-Control-Request-Headers')
    })
  })

  describe('when preflighting a request whose auth chain is deeper than a fixed allow-list would anticipate', () => {
    const requestedHeaders = Array.from({ length: 12 }, (_, index) => `x-identity-auth-chain-${index}`).join(',')
    let response: Response

    beforeEach(async () => {
      response = await fetch(`${server.getUrl()}/available-content?cid=abc`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://play.decentraland.org',
          'access-control-request-method': 'GET',
          'access-control-request-headers': requestedHeaders
        }
      })
    })

    it('should grant the whole chain regardless of its depth', () => {
      expect(response.headers.get('access-control-allow-headers')).toBe(requestedHeaders)
    })
  })

  describe('when preflighting a request that carries no identity headers', () => {
    let response: Response

    beforeEach(async () => {
      response = await fetch(`${server.getUrl()}/available-content?cid=abc`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://play.decentraland.org',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'content-type,cache-control'
        }
      })
    })

    it('should keep granting the headers uploads and cache-aware clients rely on', () => {
      expect(response.headers.get('access-control-allow-headers')).toBe('content-type,cache-control')
    })
  })

  describe('when a cross-origin client makes an actual request', () => {
    let response: Response

    beforeEach(async () => {
      response = await fetch(`${server.getUrl()}/available-content?cid=abc`, {
        headers: { origin: 'https://play.decentraland.org' }
      })
    })

    it('should allow any origin to read the response', () => {
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
    })

    // Without this the browser hides every response header outside the six CORS-safelisted ones, so
    // ETag, Retry-After and the RateLimit-* triplet would be unreadable to JS despite being sent.
    it('should expose every response header so JS can read the ones outside the safelist', () => {
      expect(response.headers.get('access-control-expose-headers')).toBe('*')
    })
  })
})
