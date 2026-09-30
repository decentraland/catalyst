import FormData from 'form-data'
import { Readable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import { RequestTimeoutError } from '../../../src/controllers/errors'
import { IUploadBudget } from '../../../src/adapters/upload-budget'

type Wrapped = (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

function buildContext(body: Readable, headers: Record<string, string>): IHttpServerComponent.DefaultContext<any> {
  return {
    request: {
      headers: { get: (name: string) => headers[name.toLowerCase()] },
      body: Readable.toWeb(body)
    }
  } as any
}

describe('when parsing a multipart request with an upload timeout', () => {
  let handler: jest.Mock
  let lease: { resize: jest.Mock; release: jest.Mock }
  let form: FormData
  let wrapped: Wrapped
  let increment: jest.Mock

  beforeEach(() => {
    increment = jest.fn()
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    lease = { resize: jest.fn().mockReturnValue(true), release: jest.fn() }
    const budget = { acquire: jest.fn().mockReturnValue(lease) } as unknown as IUploadBudget
    form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.alloc(100, 1), { filename: 'file1' })
    wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, uploadTimeoutMs: 50 }, budget, { increment })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the body stops arriving before it is complete', () => {
    let error: unknown

    beforeEach(async () => {
      const stalled = new Readable({ read() {} })
      stalled.push(form.getBuffer().subarray(0, 60))
      error = await wrapped(buildContext(stalled, form.getHeaders())).catch((e) => e)
    })

    it('should abort with a RequestTimeoutError saying what arrived, skip the handler and release the upload slot', () => {
      expect({ error, handled: handler.mock.calls.length, released: lease.release.mock.calls.length }).toEqual({
        error: new RequestTimeoutError(
          'The upload did not finish within 0.05 s: received 60 bytes. Retry on a faster connection or send smaller batches.'
        ),
        handled: 0,
        released: 1
      })
    })
  })

  describe('and a stalled body times out', () => {
    beforeEach(async () => {
      const stalled = new Readable({ read() {} })
      stalled.push(form.getBuffer().subarray(0, 60))
      await wrapped(buildContext(stalled, form.getHeaders())).catch(() => undefined)
    })

    it('should count one upload timeout', () => {
      expect(increment.mock.calls).toEqual([['dcl_multipart_upload_timeouts_total']])
    })
  })

  describe('and a body declaring its length stops arriving before it is complete', () => {
    let error: unknown

    beforeEach(async () => {
      const stalled = new Readable({ read() {} })
      stalled.push(form.getBuffer().subarray(0, 60))
      const headers = { ...form.getHeaders(), 'content-length': String(form.getBuffer().length) }
      error = await wrapped(buildContext(stalled, headers)).catch((e) => e)
    })

    it('should say how much of the declared body arrived', () => {
      expect(error).toEqual(
        new RequestTimeoutError(
          `The upload did not finish within 0.05 s: received 60 of ${form.getBuffer().length} bytes. ` +
            'Retry on a faster connection or send smaller batches.'
        )
      )
    })
  })

  describe('and the body arrives within the timeout', () => {
    let response: IHttpServerComponent.IResponse

    beforeEach(async () => {
      response = await wrapped(buildContext(Readable.from(form.getBuffer()), form.getHeaders()))
    })

    it('should run the handler without counting a timeout', () => {
      expect({ status: response.status, handled: handler.mock.calls.length, timeouts: increment.mock.calls }).toEqual({
        status: 200,
        handled: 1,
        timeouts: []
      })
    })
  })
})
