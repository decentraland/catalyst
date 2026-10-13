import { createErrorHandler, preventExecutionIfBoostrapping } from '../../../src/controllers/middlewares'
import { SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS, ServiceUnavailableError } from '../../../src/controllers/errors'
import { State } from '../../../src/logic/sync-orchestrator'

type Response = { status: number; headers?: Record<string, string>; body?: unknown }

describe('when a request fails with a transient 503', () => {
  let errorHandler: ReturnType<typeof createErrorHandler>
  let response: Response

  beforeEach(() => {
    errorHandler = createErrorHandler({
      logs: { getLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) } as any
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the error sets no retry delay', () => {
    beforeEach(async () => {
      response = (await errorHandler({} as any, async () => {
        throw new ServiceUnavailableError('The content lock is still busy, please retry shortly.')
      })) as Response
    })

    it('should answer the 503 with the default Retry-After', () => {
      expect(response).toEqual({
        status: 503,
        headers: { 'Retry-After': String(SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS) },
        body: { error: 'The content lock is still busy, please retry shortly.' }
      })
    })
  })

  describe('and the error sets its own retry delay', () => {
    beforeEach(async () => {
      response = (await errorHandler({} as any, async () => {
        throw new ServiceUnavailableError('Busy.', 42)
      })) as Response
    })

    it('should answer the 503 with that Retry-After', () => {
      expect(response.headers).toEqual({ 'Retry-After': '42' })
    })
  })
})

describe('when a deployment arrives while the catalyst is bootstrapping', () => {
  let response: Response

  beforeEach(async () => {
    const middleware = preventExecutionIfBoostrapping({
      syncOrchestrator: { getState: () => State.BOOTSTRAPPING } as any
    })
    response = (await middleware({} as any, jest.fn())) as Response
  })

  it('should answer a 503 with a Retry-After', () => {
    expect({ status: response.status, retryAfter: response.headers?.['Retry-After'] }).toEqual({
      status: 503,
      retryAfter: '60'
    })
  })
})
