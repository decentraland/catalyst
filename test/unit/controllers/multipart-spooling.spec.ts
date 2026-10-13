import FormData from 'form-data'
import { access, chmod, mkdtemp, readdir, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { Readable, Writable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { createUploadSpool } from '../../../src/adapters/upload-spool'
import { ServiceUnavailableError } from '../../../src/controllers/errors'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { spoolIn } from '../../helpers/upload-spool'

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
    wrapped = multipartParserWrapper(handler as any, { maxFileSize: 1024 }, { spool: spoolIn(tmpFolder) })
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

  describe.each(['ENOSPC', 'EIO', 'EDQUOT'])('and writing a temporary file fails with %s', (code) => {
    let error: unknown
    let logError: jest.Mock

    beforeEach(async () => {
      logError = jest.fn()
      const failingWriteStream = (): Writable =>
        new Writable({
          write: (_chunk, _encoding, callback) => callback(Object.assign(new Error(`${code}: write failed`), { code }))
        })
      error = await multipartParserWrapper(
        handler as any,
        { maxFileSize: 1024 },
        {
          spool: spoolIn(tmpFolder),
          createWriteStream: failingWriteStream,
          metrics: { increment },
          logs: { getLogger: () => ({ error: logError } as any) }
        }
      )(buildContext(form)).catch((e) => e)
    })

    it('should answer a 503 retryable in 30 s without running the handler', () => {
      expect({
        error,
        retryAfterSeconds: (error as ServiceUnavailableError).retryAfterSeconds,
        handled: handler.mock.calls.length
      }).toEqual({
        error: new ServiceUnavailableError('The server cannot store uploads right now, please retry shortly.'),
        retryAfterSeconds: 30,
        handled: 0
      })
    })

    it('should count one spool write error and log it with its code', () => {
      expect({ metrics: increment.mock.calls, logged: logError.mock.calls }).toEqual({
        metrics: [['dcl_upload_spool_failures_total', { reason: 'write_error' }]],
        logged: [['Failed to write an upload spool file', { code, error: `${code}: write failed` }]]
      })
    })
  })

  describe('and creating its spool folder fails with ENOSPC', () => {
    let error: unknown
    let logError: jest.Mock

    beforeEach(async () => {
      logError = jest.fn()
      const noSpace = Object.assign(new Error('ENOSPC: no space left on device, mkdir'), { code: 'ENOSPC' })
      error = await multipartParserWrapper(
        handler as any,
        { maxFileSize: 1024 },
        {
          spool: { createRequestFolder: jest.fn().mockRejectedValue(noSpace) },
          metrics: { increment },
          logs: { getLogger: () => ({ error: logError } as any) }
        }
      )(buildContext(form)).catch((e) => e)
    })

    it('should answer a 503 retryable in 30 s without running the handler', () => {
      expect({
        unavailable: error instanceof ServiceUnavailableError,
        message: (error as Error).message,
        retryAfterSeconds: (error as ServiceUnavailableError).retryAfterSeconds,
        handled: handler.mock.calls.length
      }).toEqual({
        unavailable: true,
        message: 'The server cannot store uploads right now, please retry shortly.',
        retryAfterSeconds: 30,
        handled: 0
      })
    })

    it('should count one spool folder failure and log it with its code', () => {
      expect({ metrics: increment.mock.calls, logged: logError.mock.calls }).toEqual({
        metrics: [['dcl_upload_spool_failures_total', { reason: 'folder' }]],
        logged: [
          [
            'Failed to create an upload spool folder',
            { code: 'ENOSPC', error: 'ENOSPC: no space left on device, mkdir' }
          ]
        ]
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
        { spool: spoolIn(tmpFolder), metrics: { increment } }
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

describe('when a multipart request arrives after the upload spool stopped', () => {
  let root: string
  let handler: jest.Mock
  let error: unknown

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    const env = new Environment()
    env.setConfig(EnvironmentConfig.UPLOAD_SPOOL_FOLDER, root)
    const spool = await createUploadSpool({ env, metrics: { increment: jest.fn() } } as unknown as Parameters<
      typeof createUploadSpool
    >[0])
    await spool[STOP_COMPONENT]?.()
    const form = new FormData()
    form.append('file1', Buffer.from('spooled content'), { filename: 'file1' })
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    error = await multipartParserWrapper(
      handler as any,
      { maxFileSize: 1024 },
      { spool }
    )(buildContext(form)).catch((e) => e)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('should answer a retryable 503 without running the handler', () => {
    expect({
      unavailable: error instanceof ServiceUnavailableError,
      message: (error as Error).message,
      handled: handler.mock.calls.length
    }).toEqual({
      unavailable: true,
      message: 'This server is shutting down and no longer accepts uploads, please retry shortly.',
      handled: 0
    })
  })
})
