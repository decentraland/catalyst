import { IHttpServerComponent } from '@dcl/core-commons'
import { ClientClosedRequestError, ServiceUnavailableError } from '../../../src/controllers/errors'
import { createErrorHandler } from '../../../src/controllers/middlewares'

describe('when the error handler maps an upload failure to a response', () => {
  let errorHandler: ReturnType<typeof createErrorHandler>
  let failure: Error
  let response: IHttpServerComponent.IResponse

  beforeEach(() => {
    errorHandler = createErrorHandler({ logs: { getLogger: () => ({ error: jest.fn() }) } } as any)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the server is unavailable', () => {
    beforeEach(async () => {
      failure = new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.', 30)
      response = await errorHandler({} as any, () => Promise.reject(failure))
    })

    it('should answer a 503 with the Retry-After the error carries', () => {
      expect(response).toEqual({
        status: 503,
        headers: { 'Retry-After': '30' },
        body: { error: 'Server is handling too many uploads, please retry shortly.' }
      })
    })
  })

  describe('and the client closed the connection mid-upload', () => {
    beforeEach(async () => {
      failure = new ClientClosedRequestError('The client closed the connection before the upload was received.')
      response = await errorHandler({} as any, () => Promise.reject(failure))
    })

    it('should answer a 499 rather than a 400', () => {
      expect(response).toEqual({
        status: 499,
        body: { error: 'The client closed the connection before the upload was received.' }
      })
    })
  })
})
