import FormData from 'form-data'
import { Readable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import { PayloadTooLargeError } from '../../../src/controllers/errors'

function buildContext(form: FormData): IHttpServerComponent.DefaultContext<any> {
  const headers = form.getHeaders()
  return {
    request: {
      headers: { get: (name: string) => headers[name.toLowerCase()] },
      // @dcl/http-server v2 exposes the request body as a native (web) ReadableStream, matching what
      // the wrapper adapts via Readable.fromWeb at runtime.
      body: Readable.toWeb(Readable.from(form.getBuffer()))
    }
  } as any
}

describe('when parsing a multipart request with upload limits', () => {
  let handler: jest.Mock

  beforeEach(() => {
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and all files are within the configured limits', () => {
    let form: FormData
    let wrapped: (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

    beforeEach(() => {
      form = new FormData()
      form.append('entityId', 'an-entity-id')
      form.append('file1', Buffer.alloc(10, 1), { filename: 'file1' })
      wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, maxFiles: 10 })
    })

    it('should invoke the handler with the parsed fields and files', async () => {
      await wrapped(buildContext(form))

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          formData: expect.objectContaining({
            fields: expect.objectContaining({ entityId: expect.objectContaining({ value: 'an-entity-id' }) }),
            files: expect.objectContaining({ file1: expect.objectContaining({ value: expect.any(Buffer) }) })
          })
        })
      )
    })
  })

  describe('and a file exceeds the maximum allowed file size', () => {
    let form: FormData
    let wrapped: (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

    beforeEach(() => {
      form = new FormData()
      form.append('big', Buffer.alloc(2048, 1), { filename: 'big.bin' })
      wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, maxFiles: 10 })
    })

    it('should reject with a PayloadTooLargeError', async () => {
      await expect(wrapped(buildContext(form))).rejects.toThrow(PayloadTooLargeError)
    })

    it('should not invoke the handler', async () => {
      await expect(wrapped(buildContext(form))).rejects.toThrow()

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('and the request contains more files than the maximum allowed', () => {
    let form: FormData
    let wrapped: (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

    beforeEach(() => {
      form = new FormData()
      form.append('f1', Buffer.alloc(1, 1), { filename: 'f1' })
      form.append('f2', Buffer.alloc(1, 1), { filename: 'f2' })
      form.append('f3', Buffer.alloc(1, 1), { filename: 'f3' })
      wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, maxFiles: 2 })
    })

    it('should reject with a PayloadTooLargeError', async () => {
      await expect(wrapped(buildContext(form))).rejects.toThrow(PayloadTooLargeError)
    })
  })
})
