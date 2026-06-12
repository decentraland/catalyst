import FormData from 'form-data'
import { Readable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import { InvalidRequestError, PayloadTooLargeError } from '../../../src/controllers/errors'

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

  describe('and the request contains more form fields than the maximum allowed', () => {
    let form: FormData
    let wrapped: (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

    beforeEach(() => {
      form = new FormData()
      // Mimics the auth-chain index-spam vector: many small form fields.
      for (let i = 0; i < 50; i++) {
        form.append(`authChain[${i}][type]`, 'SIGNER')
      }
      wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, maxFiles: 10, maxFields: 10 })
    })

    it('should reject with a PayloadTooLargeError', async () => {
      await expect(wrapped(buildContext(form))).rejects.toThrow(PayloadTooLargeError)
    })

    it('should not invoke the handler', async () => {
      await expect(wrapped(buildContext(form))).rejects.toThrow()

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('and a form field value exceeds the maximum allowed size', () => {
    let form: FormData
    let wrapped: (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

    beforeEach(() => {
      form = new FormData()
      form.append('entityId', 'x'.repeat(2048))
      wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, maxFiles: 10, maxFieldSize: 1024 })
    })

    it('should reject with a PayloadTooLargeError', async () => {
      await expect(wrapped(buildContext(form))).rejects.toThrow(PayloadTooLargeError)
    })
  })

  describe('and a form field name collides with the object prototype', () => {
    let form: FormData
    let wrapped: (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

    beforeEach(() => {
      form = new FormData()
      // On a plain `{}` object, assigning to a `__proto__` key mutates the prototype instead of
      // adding a property; on a null-prototype map it is stored as an ordinary key.
      form.append('__proto__', 'polluted')
      form.append('entityId', 'an-entity-id')
      wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, maxFiles: 10 })
    })

    it('should keep the parsed fields on a null-prototype object so the prototype is not mutated', async () => {
      await wrapped(buildContext(form))

      const { fields } = (handler.mock.calls[0][0] as any).formData
      expect(Object.getPrototypeOf(fields)).toBeNull()
    })

    it('should still expose the legitimate fields to the handler', async () => {
      await wrapped(buildContext(form))

      const { fields } = (handler.mock.calls[0][0] as any).formData
      expect(fields.entityId.value).toBe('an-entity-id')
    })
  })

  describe('and the request body is not a multipart/form-data body', () => {
    let wrapped: (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>
    let context: IHttpServerComponent.DefaultContext<any>

    beforeEach(() => {
      wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, maxFiles: 10 })
      context = {
        request: {
          headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : undefined) },
          body: Readable.toWeb(Readable.from(Buffer.from('{"not":"multipart"}')))
        }
      } as any
    })

    it('should reject with an InvalidRequestError instead of crashing with a 500', async () => {
      await expect(wrapped(context)).rejects.toThrow(InvalidRequestError)
    })

    it('should not invoke the handler', async () => {
      await expect(wrapped(context)).rejects.toThrow()

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('and the request body stream errors mid-upload (e.g. the client disconnects)', () => {
    let wrapped: (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>
    let context: IHttpServerComponent.DefaultContext<any>

    beforeEach(() => {
      const form = new FormData()
      form.append('entityId', 'an-entity-id')
      const headers = form.getHeaders()
      // A body stream that fails partway through. Without proper teardown the parser would emit
      // neither `finish` nor `error` and the wrapper would hang forever; it must reject instead.
      const erroringBody = new Readable({
        read() {
          this.destroy(new Error('socket hang up'))
        }
      })
      wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024, maxFiles: 10 })
      context = {
        request: {
          headers: { get: (name: string) => headers[name.toLowerCase()] },
          body: Readable.toWeb(erroringBody)
        }
      } as any
    })

    it('should reject rather than hang, and not invoke the handler', async () => {
      await expect(wrapped(context)).rejects.toThrow()

      expect(handler).not.toHaveBeenCalled()
    })
  })
})
