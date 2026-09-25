import FormData from 'form-data'
import { createWriteStream as createFileWriteStream } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { Readable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import { PayloadTooLargeError, ServiceUnavailableError } from '../../../src/controllers/errors'
import {
  createUploadBudget,
  IUploadBudget,
  SPOOL_FILE_OVERHEAD_BYTES,
  UploadBudgetExceededError
} from '../../../src/adapters/upload-budget'
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
  let tmpFolder: string
  let createWriteStream: jest.Mock

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    lease = { resize: jest.fn().mockReturnValue(true), release: jest.fn() }
    budget = { acquire: jest.fn().mockReturnValue(lease) }
    createWriteStream = jest.fn((filePath: string) => createFileWriteStream(filePath))
    form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.alloc(100, 1), { filename: 'file1' })
    wrapped = multipartParserWrapper(
      handler as any,
      { maxFileSize: 1024, maxFiles: 10 },
      { tmpFolder, uploadBudget: budget as unknown as IUploadBudget, createWriteStream }
    )
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await rm(tmpFolder, { recursive: true, force: true })
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

  describe('and it carries several small files', () => {
    beforeEach(async () => {
      form = new FormData()
      form.append('entityId', 'an-entity-id')
      for (let i = 0; i < 3; i++) {
        form.append(`file${i}`, Buffer.alloc(10, 1), { filename: `file${i}` })
      }
      await wrapped(
        buildContext(form.getBuffer(), { ...form.getHeaders(), 'content-length': String(form.getBuffer().length) })
      )
    })

    it('should reserve the spool file overhead of every file on top of the received bytes', () => {
      expect(lease.resize.mock.calls[lease.resize.mock.calls.length - 1]).toEqual([
        'an-entity-id'.length + 3 * 10 + 3 * SPOOL_FILE_OVERHEAD_BYTES
      ])
    })
  })

  describe('and the budget has no room for the overhead of its next file', () => {
    let declaredSize: number
    let error: unknown

    beforeEach(async () => {
      form = new FormData()
      form.append('entityId', 'an-entity-id')
      for (let i = 0; i < 3; i++) {
        form.append(`file${i}`, Buffer.alloc(10, 1), { filename: `file${i}` })
      }
      declaredSize = form.getBuffer().length
      lease.resize.mockImplementation((size: number) => size <= declaredSize + SPOOL_FILE_OVERHEAD_BYTES)
      error = await wrapped(
        buildContext(form.getBuffer(), { ...form.getHeaders(), 'content-length': String(declaredSize) })
      ).catch((e) => e)
    })

    it('should reject with a ServiceUnavailableError before creating its temporary file and release the reservation', () => {
      expect({
        error,
        filesCreated: createWriteStream.mock.calls.length,
        handled: handler.mock.calls.length,
        released: lease.release.mock.calls.length
      }).toEqual({
        error: new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'),
        filesCreated: 1,
        handled: 0,
        released: 1
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
        error: new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'),
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
        error: new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'),
        handled: 0,
        released: 1
      })
    })
  })

  describe('and a body without a declared size exceeds the total allowed while the budget is full at that total', () => {
    let maxTotalSize: number
    let error: unknown

    beforeEach(async () => {
      maxTotalSize = 50
      // Full at the footprint of a maximum-size body in one file.
      lease.resize.mockImplementation((size: number) => size <= maxTotalSize + SPOOL_FILE_OVERHEAD_BYTES)
      wrapped = multipartParserWrapper(
        handler as any,
        { maxFileSize: 1024, maxFiles: 10, maxTotalSize },
        { tmpFolder, uploadBudget: budget as unknown as IUploadBudget }
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
  let tmpFolder: string
  let outcomes: Array<number | string>

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    const form = new FormData()
    form.append('entityId', 'an-entity-id')
    form.append('file1', Buffer.alloc(1000, 1), { filename: 'file1' })
    const body = form.getBuffer()
    const headers = { ...form.getHeaders(), 'content-length': String(body.length) }
    const values: Partial<Record<EnvironmentConfig, number>> = {
      [EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES]: 2 * (body.length + SPOOL_FILE_OVERHEAD_BYTES),
      [EnvironmentConfig.MAX_CONCURRENT_UPLOADS]: 2,
      [EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE]: body.length,
      [EnvironmentConfig.MAX_UPLOAD_FILE_COUNT]: 1
    }
    const budget = createUploadBudget(
      {
        env: { getConfig: (key: EnvironmentConfig) => values[key] },
        metrics: { observe: jest.fn(), increment: jest.fn() }
      } as any,
      'disk'
    )
    const wrapped: Wrapped = multipartParserWrapper(
      jest.fn().mockResolvedValue({ status: 200, body: {} }) as any,
      { maxFileSize: 4096, maxFiles: 10, maxTotalSize: body.length },
      { tmpFolder, uploadBudget: budget }
    )
    const responses = await Promise.all([
      wrapped(buildContext(body, headers)).catch((e) => e),
      wrapped(buildContext(body, headers)).catch((e) => e)
    ])
    outcomes = responses.map((response) => (response instanceof Error ? response.name : response.status))
  })

  afterEach(async () => {
    await rm(tmpFolder, { recursive: true, force: true })
  })

  it('should complete every admitted request', () => {
    expect(outcomes).toEqual([200, 200])
  })
})

describe('when parsing multipart requests whose files together exceed the upload budget', () => {
  const FILE_COUNT = 4
  let tmpFolder: string
  let capacity: number
  let outcomes: Array<number | string>
  let filesCreated: number
  let fullCapacityAdmitted: boolean

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    const form = new FormData()
    form.append('entityId', 'an-entity-id')
    for (let i = 0; i < FILE_COUNT; i++) {
      form.append(`file${i}`, Buffer.alloc(0), { filename: `file${i}` })
    }
    const body = form.getBuffer()
    const headers = { ...form.getHeaders(), 'content-length': String(body.length) }
    // Room for one request's spool files and the other's declared bytes, but not for its files.
    capacity = 'an-entity-id'.length + FILE_COUNT * SPOOL_FILE_OVERHEAD_BYTES + body.length
    const values: Partial<Record<EnvironmentConfig, number>> = {
      [EnvironmentConfig.MAX_IN_FLIGHT_UPLOAD_BYTES]: capacity,
      [EnvironmentConfig.MAX_CONCURRENT_UPLOADS]: 2,
      [EnvironmentConfig.MAX_UPLOAD_TOTAL_SIZE]: body.length,
      [EnvironmentConfig.MAX_UPLOAD_FILE_COUNT]: FILE_COUNT
    }
    const budget = createUploadBudget(
      {
        env: { getConfig: (key: EnvironmentConfig) => values[key] },
        metrics: { observe: jest.fn(), increment: jest.fn() }
      } as any,
      'disk'
    )
    filesCreated = 0
    const wrapped: Wrapped = multipartParserWrapper(
      jest.fn().mockResolvedValue({ status: 200, body: {} }) as any,
      { maxFileSize: 4096, maxFiles: FILE_COUNT, maxTotalSize: body.length },
      {
        tmpFolder,
        uploadBudget: budget,
        createWriteStream: (filePath: string) => {
          filesCreated++
          return createFileWriteStream(filePath)
        }
      }
    )
    const responses = await Promise.all([
      wrapped(buildContext(body, headers)).catch((e) => e),
      wrapped(buildContext(body, headers)).catch((e) => e)
    ])
    outcomes = responses.map((response) => (response instanceof Error ? response.name : response.status)).sort()
    try {
      budget.acquire(capacity).release()
      fullCapacityAdmitted = true
    } catch {
      fullCapacityAdmitted = false
    }
  })

  afterEach(async () => {
    await rm(tmpFolder, { recursive: true, force: true })
  })

  it('should complete one request and reject the other as retryable before creating its temporary files', () => {
    expect({ outcomes, filesCreated }).toEqual({ outcomes: [200, 'ServiceUnavailableError'], filesCreated: FILE_COUNT })
  })

  it('should return every reservation to the budget once both settle', () => {
    expect(fullCapacityAdmitted).toBe(true)
  })
})
