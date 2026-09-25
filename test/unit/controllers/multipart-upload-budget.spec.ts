import FormData from 'form-data'
import { Readable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import {
  InvalidRequestError,
  PayloadTooLargeError,
  RequestTimeoutError,
  ServiceUnavailableError
} from '../../../src/controllers/errors'
import { createUploadBudget, IUploadBudget, UploadBudgetExceededError } from '../../../src/adapters/upload-budget'
import { EnvironmentConfig } from '../../../src/Environment'

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

    it('should reserve the declared size plus a copy of it, run the handler and release the reservation afterwards', () => {
      expect({
        reserved: budget.acquire.mock.calls,
        status: response.status,
        released: lease.release.mock.calls.length,
        releasedAfterHandler: lease.release.mock.invocationCallOrder[0] > handler.mock.invocationCallOrder[0]
      }).toEqual({ reserved: [[2 * declaredSize]], status: 200, released: 1, releasedAfterHandler: true })
    })
  })

  describe('and its declared size is larger than the maximum file size', () => {
    let declaredSize: number

    beforeEach(async () => {
      declaredSize = form.getBuffer().length
      wrapped = multipartParserWrapper(
        handler as any,
        { maxFileSize: 150, maxFiles: 10 },
        budget as unknown as IUploadBudget
      )
      await wrapped(buildContext(form.getBuffer(), { ...form.getHeaders(), 'content-length': String(declaredSize) }))
    })

    it('should reserve the declared size plus a copy of the largest file allowed', () => {
      expect(budget.acquire.mock.calls).toEqual([[declaredSize + 150]])
    })
  })

  describe('and it declares a large size but sends only the start of its body', () => {
    let declaredSize: number
    let allocatedSizes: number[]
    let error: unknown

    beforeEach(async () => {
      declaredSize = 64 * 1024 * 1024
      const body = form.getBuffer()
      const start = body.subarray(0, body.indexOf('file1') + 200)
      allocatedSizes = []
      const record = (size: number) => allocatedSizes.push(size)
      const { alloc, allocUnsafe, allocUnsafeSlow } = Buffer
      jest.spyOn(Buffer, 'alloc').mockImplementation((size, ...rest) => (record(size), alloc(size, ...rest)))
      jest.spyOn(Buffer, 'allocUnsafe').mockImplementation((size) => (record(size), allocUnsafe(size)))
      jest.spyOn(Buffer, 'allocUnsafeSlow').mockImplementation((size) => (record(size), allocUnsafeSlow(size)))
      // Never ends: the client keeps the connection open after its first bytes.
      const stalled = new Readable({ read() {} })
      stalled.push(start)
      wrapped = multipartParserWrapper(
        handler as any,
        { maxFileSize: declaredSize, maxFiles: 10, uploadTimeoutMs: 50 },
        budget as unknown as IUploadBudget
      )
      error = await wrapped({
        request: {
          headers: { get: (name: string) => ({ ...form.getHeaders(), 'content-length': String(declaredSize) }[name]) },
          body: Readable.toWeb(stalled)
        }
      } as any).catch((e) => e)
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should only allocate memory for the bytes received before timing out', () => {
      expect({ error, largestAllocation: Math.max(0, ...allocatedSizes) < 1024 * 1024 }).toEqual({
        error: new RequestTimeoutError('The multipart upload timed out.'),
        largestAllocation: true
      })
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

  describe('and the request declares its content length', () => {
    let files: Record<string, { value: Buffer }>

    beforeEach(async () => {
      handler.mockImplementationOnce(async (ctx: any) => {
        files = ctx.formData.files
        return { status: 200, body: {} }
      })
      await wrapped(
        buildContext(form.getBuffer(), { ...form.getHeaders(), 'content-length': String(form.getBuffer().length) })
      )
    })

    it('should hold the files, including their concatenated copies, within the declared reservation', () => {
      expect({ resized: lease.resize.mock.calls, file: files.file1.value }).toEqual({
        resized: [],
        file: Buffer.alloc(100, 1)
      })
    })
  })

  describe('and the body is larger than its declared content length', () => {
    let error: unknown

    beforeEach(async () => {
      error = await wrapped(buildContext(form.getBuffer(), { ...form.getHeaders(), 'content-length': '10' })).catch(
        (e) => e
      )
    })

    it('should reject with an InvalidRequestError, skip the handler and release the reservation', () => {
      expect({ error, handled: handler.mock.calls.length, released: lease.release.mock.calls.length }).toEqual({
        error: new InvalidRequestError('The request body is larger than its declared Content-Length.'),
        handled: 0,
        released: 1
      })
    })
  })

  describe('and a body without a declared size outgrows what the budget can fit', () => {
    let error: unknown

    beforeEach(async () => {
      lease.resize.mockReturnValue(false)
      error = await wrapped(buildContext(form.getBuffer(), form.getHeaders())).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError, skip the handler and release the reservation', () => {
      expect({ error, handled: handler.mock.calls.length, released: lease.release.mock.calls.length }).toEqual({
        error: new ServiceUnavailableError('Server is buffering too many uploads, please retry shortly.'),
        handled: 0,
        released: 1
      })
    })
  })

  describe('and a file of a body without a declared size is concatenated within the budget', () => {
    let bodyBytes: number

    beforeEach(async () => {
      bodyBytes = 'an-entity-id'.length + 100
      await wrapped(buildContext(form.getBuffer(), form.getHeaders()))
    })

    it('should reserve the extra copy while concatenating and return it afterwards', () => {
      expect(lease.resize.mock.calls.slice(-2)).toEqual([[bodyBytes + 100], [bodyBytes]])
    })
  })

  describe('and the budget cannot fit the copy made while concatenating a file of a body without a declared size', () => {
    let error: unknown

    beforeEach(async () => {
      const bodyBytes = 'an-entity-id'.length + 100
      lease.resize.mockImplementation((bytes: number) => bytes <= bodyBytes)
      error = await wrapped(buildContext(form.getBuffer(), form.getHeaders())).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError without running the handler', () => {
      expect({ error, handled: handler.mock.calls.length }).toEqual({
        error: new ServiceUnavailableError('Server is buffering too many uploads, please retry shortly.'),
        handled: 0
      })
    })
  })

  describe('and a body without a declared size exceeds the total allowed while the budget is full at that total', () => {
    let maxTotalSize: number
    let error: unknown

    beforeEach(async () => {
      maxTotalSize = 50
      lease.resize.mockImplementation((size: number) => size <= maxTotalSize)
      wrapped = multipartParserWrapper(
        handler as any,
        { maxFileSize: 1024, maxFiles: 10, maxTotalSize },
        budget as unknown as IUploadBudget
      )
      error = await wrapped(buildContext(form.getBuffer(), form.getHeaders())).catch((e) => e)
    })

    it('should reject with a PayloadTooLargeError without running the handler', () => {
      expect({ error, handled: handler.mock.calls.length }).toEqual({
        error: new PayloadTooLargeError(
          `The request body is too large. The maximum allowed total upload size is ${maxTotalSize} bytes.`
        ),
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

describe('when parsing multipart requests that together fill the upload budget', () => {
  let outcomes: Array<number | string>

  beforeEach(async () => {
    const form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.alloc(1000, 1), { filename: 'file1' })
    const body = form.getBuffer()
    const headers = { ...form.getHeaders(), 'content-length': String(body.length) }
    const values: Partial<Record<EnvironmentConfig, number>> = {
      // Each request's peak is its body plus a copy of its largest file (bounded by the body).
      [EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES]: 2 * (2 * body.length),
      [EnvironmentConfig.MAX_CONCURRENT_UPLOADS]: 2,
      [EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE]: body.length,
      [EnvironmentConfig.MAX_UPLOAD_FILE_SIZE]: 4096
    }
    const budget = createUploadBudget({
      env: { getConfig: (key: EnvironmentConfig) => values[key] },
      metrics: { observe: jest.fn(), increment: jest.fn() }
    } as any)
    const wrapped: Wrapped = multipartParserWrapper(
      jest.fn().mockResolvedValue({ status: 200, body: {} }) as any,
      { maxFileSize: 4096, maxFiles: 10, maxTotalSize: body.length },
      budget
    )
    const responses = await Promise.all([
      wrapped(buildContext(body, headers)).catch((e) => e),
      wrapped(buildContext(body, headers)).catch((e) => e)
    ])
    outcomes = responses.map((response) => (response instanceof Error ? response.name : response.status))
  })

  it('should complete every admitted request', () => {
    expect(outcomes).toEqual([200, 200])
  })
})
