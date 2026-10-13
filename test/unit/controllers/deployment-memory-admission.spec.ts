/**
 * @jest-environment ./test/fetch-environment.js
 */
import { IHttpServerComponent } from '@dcl/core-commons'
import { createUploadBudget, IUploadBudget } from '../../../src/adapters/upload-budget'
import { createDeploymentMemoryAdmission } from '../../../src/controllers/deployment-memory-admission'
import { ServiceUnavailableError } from '../../../src/controllers/errors'
import { EnvironmentConfig } from '../../../src/Environment'

const MAX_REQUEST_BYTES = 1000

function buildContext(url: string, headers: Record<string, string>): IHttpServerComponent.DefaultContext<object> {
  return {
    request: new Request(url, { method: 'POST', headers }),
    url: new URL(url)
  } as unknown as IHttpServerComponent.DefaultContext<object>
}

describe('when admitting a POST /entities body by the deployment memory budget', () => {
  let budget: IUploadBudget
  let next: jest.Mock
  let admission: ReturnType<typeof createDeploymentMemoryAdmission>
  let outcome: unknown

  beforeEach(() => {
    const values: Partial<Record<EnvironmentConfig, unknown>> = {
      [EnvironmentConfig.MAX_IN_MEMORY_DEPLOYMENT_BYTES]: MAX_REQUEST_BYTES,
      [EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE]: MAX_REQUEST_BYTES
    }
    const env = { getConfig: (key: EnvironmentConfig) => values[key] }
    budget = createUploadBudget({ env, metrics: { observe: jest.fn(), increment: jest.fn() } } as any, 'memory')
    next = jest.fn().mockResolvedValue({ status: 200 })
    admission = createDeploymentMemoryAdmission({ env, deploymentMemoryBudget: budget } as any)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and another deployment holds the memory a regular deployment declares', () => {
    beforeEach(async () => {
      budget.acquire(MAX_REQUEST_BYTES - 299)
      outcome = await admission(buildContext('http://localhost/entities', { 'content-length': '300' }), next).catch(
        (e) => e
      )
    })

    it('should shed it with a 503 retryable in 30 s before its body is read', () => {
      expect({
        outcome,
        retryAfterSeconds: (outcome as ServiceUnavailableError).retryAfterSeconds,
        bodyRead: next.mock.calls.length
      }).toEqual({
        outcome: new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'),
        retryAfterSeconds: 30,
        bodyRead: 0
      })
    })
  })

  describe('and the memory a regular deployment declares is free', () => {
    let freeAfterwards: boolean

    beforeEach(async () => {
      budget.acquire(MAX_REQUEST_BYTES - 300)
      outcome = await admission(buildContext('http://localhost/entities', { 'content-length': '300' }), next)
      freeAfterwards = budget.fits(300)
    })

    it('should read its body without reserving the memory, which the handler takes once the files are received', () => {
      expect({ outcome, freeAfterwards }).toEqual({ outcome: { status: 200 }, freeAfterwards: true })
    })
  })

  describe('and a request declaring itself a partial batch declares more than is free', () => {
    beforeEach(async () => {
      budget.acquire(MAX_REQUEST_BYTES)
      outcome = await admission(
        buildContext('http://localhost/entities?partial=true', { 'content-length': '300' }),
        next
      )
    })

    it('should read its body, since partial batches stream their files from disk', () => {
      expect(outcome).toEqual({ status: 200 })
    })
  })
})
