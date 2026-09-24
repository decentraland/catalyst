import FormData from 'form-data'
import { Readable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import { ServiceUnavailableError } from '../../../src/controllers/errors'
import { IUploadBudget, UploadBudgetExceededError } from '../../../src/adapters/upload-budget'

type Wrapped = (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

function buildContext(
  body: Buffer,
  headers: Record<string, string | undefined>
): IHttpServerComponent.DefaultContext<any> {
  return {
    request: {
      headers: { get: (name: string) => headers[name.toLowerCase()] },
      body: Readable.toWeb(Readable.from(body))
    }
  } as any
}

describe('when parsing a multipart request under an upload budget', () => {
  let handler: jest.Mock
  let lease: { resize: jest.Mock; release: jest.Mock }
  let budget: { acquire: jest.Mock }
  let form: FormData
  let wrapped: Wrapped

  beforeEach(() => {
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    lease = { resize: jest.fn().mockReturnValue(true), release: jest.fn() }
    budget = { acquire: jest.fn().mockReturnValue(lease) }
    form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.alloc(100, 1), { filename: 'file1' })
    wrapped = multipartParserWrapper(
      handler as any,
      { maxFileSize: 1024, maxFiles: 10 },
      budget as unknown as IUploadBudget
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the budget admits it with its declared size', () => {
    let declaredSize: number
    let response: IHttpServerComponent.IResponse

    beforeEach(async () => {
      declaredSize = form.getBuffer().length
      response = await wrapped(
        buildContext(form.getBuffer(), { ...form.getHeaders(), 'content-length': String(declaredSize) })
      )
    })

    it('should reserve the declared size, run the handler and release the reservation afterwards', () => {
      expect({
        reserved: budget.acquire.mock.calls,
        status: response.status,
        released: lease.release.mock.calls.length,
        releasedAfterHandler: lease.release.mock.invocationCallOrder[0] > handler.mock.invocationCallOrder[0]
      }).toEqual({ reserved: [[declaredSize]], status: 200, released: 1, releasedAfterHandler: true })
    })
  })

  describe('and the request declares no content length', () => {
    beforeEach(async () => {
      await wrapped(buildContext(form.getBuffer(), form.getHeaders()))
    })

    it('should reserve nothing up front and grow the reservation as the body arrives', () => {
      expect({ reserved: budget.acquire.mock.calls, grew: lease.resize.mock.calls.length > 0 }).toEqual({
        reserved: [[0]],
        grew: true
      })
    })
  })

  describe('and the budget has no room for it', () => {
    let error: unknown

    beforeEach(async () => {
      budget.acquire.mockImplementationOnce(() => {
        throw new UploadBudgetExceededError('concurrency')
      })
      error = await wrapped(buildContext(form.getBuffer(), form.getHeaders())).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError without running the handler', () => {
      expect({ error, handled: handler.mock.calls.length }).toEqual({
        error: new ServiceUnavailableError('Server is buffering too many uploads, please retry shortly.'),
        handled: 0
      })
    })
  })

  describe('and the body outgrows its reservation beyond what the budget can fit', () => {
    let error: unknown

    beforeEach(async () => {
      lease.resize.mockReturnValue(false)
      error = await wrapped(buildContext(form.getBuffer(), { ...form.getHeaders(), 'content-length': '10' })).catch(
        (e) => e
      )
    })

    it('should reject with a ServiceUnavailableError, skip the handler and release the reservation', () => {
      expect({ error, handled: handler.mock.calls.length, released: lease.release.mock.calls.length }).toEqual({
        error: new ServiceUnavailableError('Server is buffering too many uploads, please retry shortly.'),
        handled: 0,
        released: 1
      })
    })
  })

  describe('and a file is concatenated within the budget', () => {
    let declaredSize: number

    beforeEach(async () => {
      declaredSize = form.getBuffer().length
      await wrapped(buildContext(form.getBuffer(), { ...form.getHeaders(), 'content-length': String(declaredSize) }))
    })

    it('should reserve the extra copy while concatenating and return it afterwards', () => {
      expect(lease.resize.mock.calls).toEqual([[declaredSize + 100], [declaredSize]])
    })
  })

  describe('and the budget cannot fit the copy made while concatenating a file', () => {
    let error: unknown

    beforeEach(async () => {
      lease.resize.mockReturnValue(false)
      error = await wrapped(
        buildContext(form.getBuffer(), { ...form.getHeaders(), 'content-length': String(form.getBuffer().length) })
      ).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError without running the handler', () => {
      expect({ error, handled: handler.mock.calls.length }).toEqual({
        error: new ServiceUnavailableError('Server is buffering too many uploads, please retry shortly.'),
        handled: 0
      })
    })
  })

  describe('and the handler fails', () => {
    let error: unknown

    beforeEach(async () => {
      handler.mockRejectedValueOnce(new Error('handler failed'))
      error = await wrapped(buildContext(form.getBuffer(), form.getHeaders())).catch((e) => e)
    })

    it('should still release the reservation', () => {
      expect({ error, released: lease.release.mock.calls.length }).toEqual({
        error: new Error('handler failed'),
        released: 1
      })
    })
  })

  describe('and the body is not multipart', () => {
    let error: unknown

    beforeEach(async () => {
      error = await wrapped(buildContext(Buffer.from('{}'), { 'content-type': 'application/json' })).catch((e) => e)
    })

    it('should release the reservation after rejecting the request', () => {
      expect({ rejected: error instanceof Error, released: lease.release.mock.calls.length }).toEqual({
        rejected: true,
        released: 1
      })
    })
  })
})
