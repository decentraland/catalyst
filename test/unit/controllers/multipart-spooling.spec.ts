import FormData from 'form-data'
import { access, chmod, mkdtemp, readdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { Readable, Writable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'

type Wrapped = (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

function buildContext(form: FormData): IHttpServerComponent.DefaultContext<any> {
  const headers = form.getHeaders()
  return {
    request: {
      headers: { get: (name: string) => headers[name.toLowerCase()] },
      body: Readable.toWeb(Readable.from(form.getBuffer()))
    }
  } as any
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  )
}

describe('when a multipart request spools its files to disk', () => {
  let tmpFolder: string
  let form: FormData
  let handler: jest.Mock
  let spooledPath: string
  let wrapped: Wrapped

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.from('spooled content'), { filename: 'file1' })
    handler = jest.fn()
    wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024 }, { tmpFolder })
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await rm(tmpFolder, { recursive: true, force: true })
  })

  describe('and the handler succeeds', () => {
    let contentDuringHandler: string
    let existsAfterwards: boolean
    let leftovers: string[]

    beforeEach(async () => {
      handler.mockImplementationOnce(async (ctx: any) => {
        spooledPath = ctx.formData.files.file1.path
        contentDuringHandler = (await readFile(spooledPath)).toString()
        return { status: 200, body: {} }
      })
      await wrapped(buildContext(form))
      existsAfterwards = await exists(spooledPath)
      leftovers = await readdir(tmpFolder)
    })

    it('should hand the handler the file on disk and remove it once the handler returns', () => {
      expect({ contentDuringHandler, existsAfterwards, leftovers }).toEqual({
        contentDuringHandler: 'spooled content',
        existsAfterwards: false,
        leftovers: []
      })
    })
  })

  describe('and the handler fails', () => {
    let error: unknown
    let leftovers: string[]

    beforeEach(async () => {
      handler.mockRejectedValueOnce(new Error('handler failed'))
      error = await wrapped(buildContext(form)).catch((e) => e)
      leftovers = await readdir(tmpFolder)
    })

    it('should still remove the temporary files', () => {
      expect({ error, leftovers }).toEqual({ error: new Error('handler failed'), leftovers: [] })
    })
  })
})

describe('when spooling a multipart request fails', () => {
  let tmpFolder: string
  let form: FormData
  let handler: jest.Mock
  let increment: jest.Mock

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.from('spooled content'), { filename: 'file1' })
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    increment = jest.fn()
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await chmod(tmpFolder, 0o755)
    await rm(tmpFolder, { recursive: true, force: true })
  })

  describe('and writing a temporary file fails', () => {
    let error: unknown

    beforeEach(async () => {
      const failingWriteStream = (): Writable =>
        new Writable({ write: (_chunk, _encoding, callback) => callback(new Error('ENOSPC: no space left')) })
      error = await multipartParserWrapper(
        handler as any,
        { maxFileSize: 1024 },
        { tmpFolder, createWriteStream: failingWriteStream, metrics: { increment } }
      )(buildContext(form)).catch((e) => e)
    })

    it('should fail with the write error without running the handler and count one spool write error', () => {
      expect({ error, handled: handler.mock.calls.length, metrics: increment.mock.calls }).toEqual({
        error: new Error('ENOSPC: no space left'),
        handled: 0,
        metrics: [['dcl_upload_spool_failures_total', { reason: 'write_error' }]]
      })
    })
  })

  describe('and removing its spool folder fails', () => {
    let response: IHttpServerComponent.IResponse

    beforeEach(async () => {
      // A read-only parent keeps the request's spool folder from being removed.
      handler.mockImplementationOnce(async () => {
        await chmod(tmpFolder, 0o555)
        return { status: 200, body: {} }
      })
      response = await multipartParserWrapper(
        handler as any,
        { maxFileSize: 1024 },
        { tmpFolder, metrics: { increment } }
      )(buildContext(form))
    })

    it('should still answer the handler response and count one spool cleanup failure', () => {
      expect({ status: response.status, metrics: increment.mock.calls }).toEqual({
        status: 200,
        metrics: [['dcl_upload_spool_failures_total', { reason: 'cleanup' }]]
      })
    })
  })
})
