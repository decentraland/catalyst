/**
 * @jest-environment ./test/fetch-environment.js
 */
import { IHttpServerComponent } from '@dcl/core-commons'
import { InvalidRequestError } from '../../../src/controllers/errors'
import { PartialQuotaContext, withDeploymentQuota } from '../../../src/controllers/deployment-quota'
import { EnvironmentConfig } from '../../../src/Environment'
import { DeploymentQuotaExceededError } from '../../../src/logic/deployment-quota'
import { FormDataContext } from '../../../src/types'

const CLIENT_IP_HEADER = 'x-test-client-ip'
const SOURCE = '203.0.113.1'

type Context = FormDataContext<object> & PartialQuotaContext

function buildContext(partial: boolean): Context {
  return {
    request: { headers: new Headers({ [CLIENT_IP_HEADER]: SOURCE }) },
    url: new URL(`http://localhost/entities${partial ? '?partial=true' : ''}`),
    remoteAddress: '198.51.100.9',
    formData: { fields: partial ? { partial: { fieldname: 'partial', value: 'true' } } : {}, files: {} }
  } as unknown as Context
}

describe('when counting POST /entities requests against the daily quota', () => {
  let assertAvailable: jest.Mock
  let consume: jest.Mock
  let handler: jest.Mock
  let wrapped: (context: Context) => Promise<IHttpServerComponent.IResponse>
  let context: Context
  let response: IHttpServerComponent.IResponse | undefined
  let error: unknown

  beforeEach(() => {
    assertAvailable = jest.fn().mockResolvedValue(undefined)
    consume = jest.fn().mockResolvedValue(undefined)
    handler = jest.fn()
    wrapped = withDeploymentQuota<Context>(
      {
        deploymentQuota: { assertAvailable, consume },
        env: {
          getConfig: (key: EnvironmentConfig) =>
            key === EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER ? CLIENT_IP_HEADER : undefined
        }
      } as any,
      handler
    )
    response = undefined
    error = undefined
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and a partial batch is rejected before it joins its upload', () => {
    beforeEach(async () => {
      context = buildContext(true)
      handler.mockResolvedValueOnce({ status: 400, body: { errors: ['The signature is invalid.'] } })
      response = await wrapped(context)
    })

    it('should count it against the source and keep its answer', () => {
      expect({ counted: consume.mock.calls, response }).toEqual({
        counted: [[SOURCE]],
        response: { status: 400, body: { errors: ['The signature is invalid.'] } }
      })
    })
  })

  describe('and a partial batch is rejected after it joined its upload', () => {
    beforeEach(async () => {
      context = buildContext(true)
      handler.mockImplementationOnce(async (ctx: Context) => {
        ctx.partialQuota!.admitted = true
        return { status: 400, body: { errors: ['Deployment failed: The deployment is too big.'] } }
      })
      response = await wrapped(context)
    })

    it('should not count it', () => {
      expect({ counted: consume.mock.calls.length, status: response?.status }).toEqual({ counted: 0, status: 400 })
    })
  })

  describe('and a partial batch is accepted', () => {
    beforeEach(async () => {
      context = buildContext(true)
      handler.mockResolvedValueOnce({ status: 202, body: { missing: [] } })
      response = await wrapped(context)
    })

    it('should not count it', () => {
      expect({ counted: consume.mock.calls.length, status: response?.status }).toEqual({ counted: 0, status: 202 })
    })
  })

  describe('and a partial batch is rejected as a malformed request', () => {
    beforeEach(async () => {
      context = buildContext(true)
      handler.mockRejectedValueOnce(new InvalidRequestError('Invalid auth chain'))
      error = await wrapped(context).catch((e) => e)
    })

    it('should count it and let the error through', () => {
      expect({ counted: consume.mock.calls, error }).toEqual({
        counted: [[SOURCE]],
        error: new InvalidRequestError('Invalid auth chain')
      })
    })
  })

  describe('and a partial batch comes from a source that spent its quota', () => {
    beforeEach(async () => {
      context = buildContext(true)
      assertAvailable.mockRejectedValueOnce(new DeploymentQuotaExceededError(120))
      handler.mockResolvedValueOnce({ status: 202, body: { missing: [] } })
      response = await wrapped(context)
    })

    it('should hand the batch to the handler with the time left until the quota resets', () => {
      expect({ checked: assertAvailable.mock.calls, quota: context.partialQuota, status: response?.status }).toEqual({
        checked: [[SOURCE]],
        quota: { exhaustedRetryAfterSeconds: 120, admitted: false },
        status: 202
      })
    })
  })

  describe('and a regular deployment fails validation', () => {
    beforeEach(async () => {
      context = buildContext(false)
      context.url = new URL('http://localhost/entities')
      handler.mockResolvedValueOnce({ status: 400, body: { errors: ['invalid'] } })
      response = await wrapped(context)
    })

    it('should count it once, before handling it', () => {
      expect({ counted: consume.mock.calls, status: response?.status }).toEqual({ counted: [[SOURCE]], status: 400 })
    })
  })
})
