import FormData from 'form-data'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { Readable, Writable } from 'stream'
import { IHttpServerComponent } from '@dcl/core-commons'
import { multipartParserWrapper } from '../../../src/controllers/multipart'
import { RequestTimeoutError } from '../../../src/controllers/errors'
import { IUploadBudget } from '../../../src/adapters/upload-budget'
import { spoolIn } from '../../helpers/upload-spool'

type Wrapped = (ctx: IHttpServerComponent.DefaultContext<any>) => Promise<IHttpServerComponent.IResponse>

const KiB = 1024
const MIN_RATE = 64 * KiB
const WINDOW_MS = 10_000

function buildContext(body: Readable, headers: Record<string, string>): IHttpServerComponent.DefaultContext<any> {
  return {
    request: {
      headers: { get: (name: string) => headers[name.toLowerCase()] },
      body: Readable.toWeb(body)
    }
  } as any
}

// Captured before the fake timers replace it.
const realSetImmediate = setImmediate

// Lets the streams move whatever is already buffered while the clock stands still.
async function settleStreams(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => realSetImmediate(resolve))
  }
}

describe('when parsing a multipart request with a minimum receive rate', () => {
  let tmpFolder: string
  let handler: jest.Mock
  let increment: jest.Mock
  let lease: { resize: jest.Mock; release: jest.Mock }
  let budget: IUploadBudget
  let form: FormData
  let body: Readable
  let createWriteStream: ((filePath: string) => Writable) | undefined
  let upload: Promise<unknown>
  let outcome: unknown

  function wrap(): Wrapped {
    return multipartParserWrapper(
      handler as any,
      {
        maxFileSize: 4 * 1024 * KiB,
        uploadTimeoutMs: 6 * WINDOW_MS,
        minReceiveBytesPerSecond: MIN_RATE,
        receiveRateWindowMs: WINDOW_MS
      },
      { spool: spoolIn(tmpFolder), uploadBudget: budget, metrics: { increment }, createWriteStream }
    )
  }

  beforeEach(async () => {
    tmpFolder = await mkdtemp(path.join(tmpdir(), 'multipart-'))
    jest.useFakeTimers('modern')
    handler = jest.fn().mockResolvedValue({ status: 200, body: {} })
    increment = jest.fn()
    lease = { resize: jest.fn().mockReturnValue(true), release: jest.fn() }
    budget = { acquire: jest.fn().mockReturnValue(lease) } as unknown as IUploadBudget
    createWriteStream = undefined
    body = new Readable({ read() {} })
    form = new FormData()
    form.append('entityId', 'an-entity-id')
  })

  afterEach(async () => {
    jest.useRealTimers()
    jest.resetAllMocks()
    body.destroy()
    await upload
    await rm(tmpFolder, { recursive: true, force: true })
  })

  describe('and the body stalls after a few bytes', () => {
    beforeEach(async () => {
      form.append('file1', Buffer.alloc(100, 1), { filename: 'file1' })
      body.push(form.getBuffer().subarray(0, 60))
      upload = wrap()(buildContext(body, form.getHeaders())).catch((e) => e)
      await settleStreams()
      jest.advanceTimersByTime(WINDOW_MS)
      outcome = await upload
    })

    it('should abort with a 408 stating the measured and the required rate, skip the handler and release the upload slot', () => {
      expect({ outcome, handled: handler.mock.calls.length, released: lease.release.mock.calls.length }).toEqual({
        outcome: new RequestTimeoutError(
          'The upload is too slow: received 60 bytes in 10 s (0.01 KiB/s), below the required 64 KiB/s. ' +
            'Retry on a faster connection.'
        ),
        handled: 0,
        released: 1
      })
    })

    it('should count one upload aborted as too slow', () => {
      expect(increment.mock.calls).toEqual([['dcl_multipart_upload_aborts_total', { reason: 'too_slow' }]])
    })
  })

  describe('and the body stalls only for part of a window', () => {
    let settledEarly: boolean

    beforeEach(async () => {
      form.append('file1', Buffer.alloc(100, 1), { filename: 'file1' })
      body.push(form.getBuffer().subarray(0, 60))
      settledEarly = false
      upload = wrap()(buildContext(body, form.getHeaders())).then(
        (response) => response,
        (e) => e
      )
      upload.finally(() => (settledEarly = true))
      await settleStreams()
      jest.advanceTimersByTime(WINDOW_MS - WINDOW_MS / 10)
      await settleStreams()
    })

    it('should not abort it during its grace window', () => {
      expect(settledEarly).toBe(false)
    })
  })

  describe('and the body keeps arriving faster than the minimum rate', () => {
    beforeEach(async () => {
      form.append('file1', Buffer.alloc(15 * 2 * MIN_RATE, 1), { filename: 'file1' })
      const buffer = form.getBuffer()
      upload = wrap()(buildContext(body, form.getHeaders())).catch((e) => e)
      // Twice the minimum rate, one second at a time, over one and a half windows.
      for (let offset = 0; offset < buffer.length; offset += 2 * MIN_RATE) {
        body.push(buffer.subarray(offset, offset + 2 * MIN_RATE))
        await settleStreams()
        jest.advanceTimersByTime(1000)
      }
      body.push(null)
      outcome = await upload
    })

    it('should run the handler without counting an abort', () => {
      expect({ outcome, aborts: increment.mock.calls }).toEqual({ outcome: { status: 200, body: {} }, aborts: [] })
    })
  })

  describe('and the server holds the body back for longer than a window', () => {
    let releaseWrites: () => void

    beforeEach(async () => {
      const heldWrites: Array<() => void> = []
      let held = true
      releaseWrites = () => {
        held = false
        heldWrites.splice(0).forEach((resume) => resume())
      }
      // A stuck disk: writes complete only once released.
      createWriteStream = () =>
        new Writable({
          write: (_chunk, _encoding, callback) => (held ? heldWrites.push(() => callback()) : callback())
        })
      form.append('file1', Buffer.alloc(512 * KiB, 1), { filename: 'file1' })
      const buffer = form.getBuffer()
      for (let offset = 0; offset < buffer.length; offset += KiB) {
        body.push(buffer.subarray(offset, offset + KiB))
      }
      body.push(null)
      upload = wrap()(buildContext(body, form.getHeaders())).catch((e) => e)
      await settleStreams()
      jest.advanceTimersByTime(3 * WINDOW_MS)
      releaseWrites()
      outcome = await upload
    })

    it('should not count that time against the client and run the handler', () => {
      expect({ outcome, aborts: increment.mock.calls }).toEqual({ outcome: { status: 200, body: {} }, aborts: [] })
    })
  })

  describe('and the minimum rate is disabled', () => {
    let settledEarly: boolean

    beforeEach(async () => {
      form.append('file1', Buffer.alloc(100, 1), { filename: 'file1' })
      body.push(form.getBuffer().subarray(0, 60))
      settledEarly = false
      upload = multipartParserWrapper(
        handler as any,
        {
          maxFileSize: KiB,
          uploadTimeoutMs: 6 * WINDOW_MS,
          minReceiveBytesPerSecond: 0,
          receiveRateWindowMs: WINDOW_MS
        },
        { spool: spoolIn(tmpFolder), uploadBudget: budget, metrics: { increment } }
      )(buildContext(body, form.getHeaders())).catch((e) => e)
      upload.finally(() => (settledEarly = true))
      await settleStreams()
      jest.advanceTimersByTime(3 * WINDOW_MS)
      await settleStreams()
    })

    it('should leave the stalled body to the upload timeout', () => {
      expect(settledEarly).toBe(false)
    })
  })
})
