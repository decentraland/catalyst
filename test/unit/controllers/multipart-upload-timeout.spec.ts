import FormData from 'form-data'
import { mkdtemp, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { Readable, Writable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import { RequestTimeoutError, ServiceUnavailableError } from '../../../src/controllers/errors'
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
  let tmpFolder: string

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    lease = { resize: jest.fn().mockReturnValue(true), release: jest.fn() }
    const budget = { acquire: jest.fn().mockReturnValue(lease) } as unknown as IUploadBudget
    form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.alloc(100, 1), { filename: 'file1' })
    wrapped = multipartParserWrapper(
      handler as any,
      { maxFileSize: 1024, uploadTimeoutMs: 50 },
      { tmpFolder, uploadBudget: budget }
    )
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await rm(tmpFolder, { recursive: true, force: true })
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

    it('should run the handler', () => {
      expect({ status: response.status, handled: handler.mock.calls.length }).toEqual({ status: 200, handled: 1 })
    })
  })
})

describe('when parsing a multipart request whose temporary files are slow to write', () => {
  let handler: jest.Mock
  let lease: { resize: jest.Mock; release: jest.Mock }
  let budget: IUploadBudget
  let form: FormData
  let tmpFolder: string
  let finalDelayMs: number | undefined

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    handler = jest.fn(async (ctx: any) => ({ status: 200, body: Object.keys(ctx.formData.files).length }))
    lease = { resize: jest.fn().mockReturnValue(true), release: jest.fn() }
    budget = { acquire: jest.fn().mockReturnValue(lease) } as unknown as IUploadBudget
    form = new FormData()
    form.append('entityId', 'an-entity-id')
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await rm(tmpFolder, { recursive: true, force: true })
  })

  // A slow disk: every temporary file takes `finalDelayMs` to flush and close, or never does when unset.
  function slowWriteStream(): Writable {
    return new Writable({
      write: (_chunk, _encoding, callback) => callback(),
      final: (callback) => {
        if (finalDelayMs !== undefined) {
          setTimeout(callback, finalDelayMs)
        }
      }
    })
  }

  describe('and the last files are still flushing after the whole body arrived', () => {
    let response: IHttpServerComponent.IResponse

    beforeEach(async () => {
      finalDelayMs = 300
      form.append('file1', Buffer.alloc(6000, 1), { filename: 'file1' })
      response = await multipartParserWrapper(
        handler as any,
        { maxFileSize: 10_000, uploadTimeoutMs: 50 },
        { tmpFolder, uploadBudget: budget, createWriteStream: slowWriteStream }
      )(buildContext(Readable.from(form.getBuffer()), form.getHeaders()))
    })

    it('should wait for the flush past the upload timeout and run the handler', () => {
      expect({ status: response.status, files: response.body }).toEqual({ status: 200, files: 1 })
    })
  })

  describe('and a temporary file never finishes flushing', () => {
    let error: unknown
    let leftovers: string[]

    beforeEach(async () => {
      finalDelayMs = undefined
      form.append('file1', Buffer.alloc(100, 1), { filename: 'file1' })
      error = await multipartParserWrapper(
        handler as any,
        { maxFileSize: 1024 },
        { tmpFolder, uploadBudget: budget, createWriteStream: slowWriteStream, spoolFlushTimeoutMs: 50 }
      )(buildContext(Readable.from(form.getBuffer()), form.getHeaders())).catch((e) => e)
      leftovers = await readdir(tmpFolder)
    })

    it('should fail with a retryable ServiceUnavailableError, skip the handler, release the upload slot and remove the spool', () => {
      expect({
        error,
        handled: handler.mock.calls.length,
        released: lease.release.mock.calls.length,
        leftovers
      }).toEqual({
        error: new ServiceUnavailableError('The upload could not be stored in time, please retry shortly.'),
        handled: 0,
        released: 1,
        leftovers: []
      })
    })
  })
})
