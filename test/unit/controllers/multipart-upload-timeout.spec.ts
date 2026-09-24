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

  beforeEach(() => {
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    lease = { resize: jest.fn().mockReturnValue(true), release: jest.fn() }
    const budget = { acquire: jest.fn().mockReturnValue(lease) } as unknown as IUploadBudget
    form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.alloc(100, 1), { filename: 'file1' })
    wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, uploadTimeoutMs: 50 }, budget)
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

    it('should abort with a RequestTimeoutError, skip the handler and release the upload slot', () => {
      expect({ error, handled: handler.mock.calls.length, released: lease.release.mock.calls.length }).toEqual({
        error: new RequestTimeoutError('The multipart upload timed out.'),
        handled: 0,
        released: 1
      })
    })
  })

  describe('and the body arrives within the timeout', () => {
    let response: IHttpServerComponent.IResponse

    beforeEach(async () => {
      response = await wrapped(buildContext(Readable.from(form.getBuffer()), form.getHeaders()))
    })

    it('should run the handler', () => {
      expect({ status: response.status, handled: handler.mock.calls.length }).toEqual({ status: 200, handled: 1 })
    })
  })
})
