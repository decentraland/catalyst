/**
 * @jest-environment ./test/fetch-environment.js
 */
import { IHttpServerComponent } from '@dcl/core-commons'
import { SourceUploadLimitExceededError } from '../../../src/adapters/source-upload-limits'
import { createSourceUploadAdmission } from '../../../src/controllers/source-upload-admission'
import { EnvironmentConfig } from '../../../src/Environment'

const MAX_REQUEST_BYTES = 1000
const CLIENT_IP_HEADER = 'x-test-client-ip'

function buildContext(headers: Record<string, string>): IHttpServerComponent.DefaultContext<object> {
  return {
    request: new Request('http://localhost/entities', { method: 'POST', headers }),
    url: new URL('http://localhost/entities'),
    remoteAddress: '198.51.100.9'
  } as unknown as IHttpServerComponent.DefaultContext<object>
}

describe('when admitting a POST /entities body by its source', () => {
  let lease: { release: jest.Mock }
  let acquire: jest.Mock
  let next: jest.Mock
  let admission: ReturnType<typeof createSourceUploadAdmission>
  let response: IHttpServerComponent.IResponse | unknown

  beforeEach(() => {
    lease = { release: jest.fn() }
    acquire = jest.fn().mockReturnValue(lease)
    next = jest.fn().mockResolvedValue({ status: 200 })
    const values: Partial<Record<EnvironmentConfig, unknown>> = {
      [EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE]: MAX_REQUEST_BYTES,
      [EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER]: CLIENT_IP_HEADER
    }
    admission = createSourceUploadAdmission({
      env: { getConfig: (key: EnvironmentConfig) => values[key] },
      sourceUploadLimits: { acquire }
    } as any)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the source has room for it', () => {
    beforeEach(async () => {
      response = await admission(buildContext({ [CLIENT_IP_HEADER]: '203.0.113.1', 'content-length': '300' }), next)
    })

    it('should charge the declared size to the client source and release it once the request ends', () => {
      expect({
        charged: acquire.mock.calls,
        response,
        released: lease.release.mock.calls.length,
        releasedAfterRequest: lease.release.mock.invocationCallOrder[0] > next.mock.invocationCallOrder[0]
      }).toEqual({
        charged: [['203.0.113.1', 300]],
        response: { status: 200 },
        released: 1,
        releasedAfterRequest: true
      })
    })
  })

  describe('and the request does not declare its size', () => {
    beforeEach(async () => {
      response = await admission(buildContext({ [CLIENT_IP_HEADER]: '203.0.113.1' }), next)
    })

    it('should charge the largest body it may grow to', () => {
      expect(acquire.mock.calls).toEqual([['203.0.113.1', MAX_REQUEST_BYTES]])
    })
  })

  describe('and the request declares more than the maximum upload size', () => {
    beforeEach(async () => {
      response = await admission(buildContext({ [CLIENT_IP_HEADER]: '203.0.113.1', 'content-length': '5000' }), next)
    })

    it('should charge only the maximum and let the parser reject it as too large', () => {
      expect({ charged: acquire.mock.calls, forwarded: next.mock.calls.length }).toEqual({
        charged: [['203.0.113.1', MAX_REQUEST_BYTES]],
        forwarded: 1
      })
    })
  })

  describe('and the request fails after being admitted', () => {
    beforeEach(async () => {
      next.mockRejectedValueOnce(new Error('parser failed'))
      response = await admission(buildContext({ 'content-length': '300' }), next).catch((error) => error)
    })

    it('should still release the share of the source', () => {
      expect({ response, released: lease.release.mock.calls.length }).toEqual({
        response: new Error('parser failed'),
        released: 1
      })
    })
  })

  describe('and the source already has its share in flight', () => {
    beforeEach(async () => {
      acquire.mockImplementationOnce(() => {
        throw new SourceUploadLimitExceededError('source_concurrency')
      })
      response = await admission(buildContext({ [CLIENT_IP_HEADER]: '203.0.113.1', 'content-length': '300' }), next)
    })

    it('should answer a 429 with Retry-After without reading the body', () => {
      expect({ response, forwarded: next.mock.calls.length }).toEqual({
        response: {
          status: 429,
          headers: { 'Retry-After': '5' },
          body: { error: 'Too many uploads in progress from this client, please retry shortly.' }
        },
        forwarded: 0
      })
    })
  })
})
