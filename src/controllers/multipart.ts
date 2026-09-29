import { IHttpServerComponent } from '@dcl/core-commons'
import { Field } from '@well-known-components/multipart-wrapper'
import busboy from 'busboy'
import { createWriteStream } from 'fs'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import path from 'path'
import { Readable, Writable } from 'stream'
import { pipeline } from 'stream/promises'
import { FormDataContext, SpooledFile } from '../types'
import {
  IUploadBudget,
  SPOOL_FILE_OVERHEAD_BYTES,
  UploadBudgetExceededError,
  UploadBudgetLease
} from '../adapters/upload-budget'
import { InvalidRequestError, PayloadTooLargeError, RequestTimeoutError, ServiceUnavailableError } from './errors'

/**
 * Limits applied to a multipart request while it is received.
 *
 * The upstream `@well-known-components/multipart-wrapper` buffers every uploaded file
 * fully in memory (`Buffer.concat`) with no bound, and this happens *before* any
 * authentication/validation runs — so an unauthenticated client can exhaust memory by
 * streaming a large body. This wrapper is a drop-in replacement that spools files to
 * temporary files, wires `busboy`'s native limits and rejects (HTTP 413) as soon as a
 * limit is exceeded, instead of silently truncating.
 *
 * `maxTotalSize` additionally bounds the cumulative size of every file and field value; with the file
 * and field counts it also bounds the whole body, multipart framing included (pre-checked against the
 * declared Content-Length).
 */
export type MultipartLimits = {
  /** Maximum size, in bytes, accepted for any single uploaded file. */
  maxFileSize?: number
  /** Maximum number of files accepted in a single request. */
  maxFiles?: number
  /** Maximum number of non-file form fields accepted in a single request. */
  maxFields?: number
  /** Maximum size, in bytes, accepted for any single non-file field value. */
  maxFieldSize?: number
  /** Maximum cumulative size, in bytes, across every file and field in a single request. */
  maxTotalSize?: number
  /** Maximum time, in milliseconds, to receive the whole body. */
  uploadTimeoutMs?: number
  /**
   * Least body bytes per second, measured over `receiveRateWindowMs`, before the upload is aborted. Only
   * time spent waiting on the client counts, not time the body is held back while the spool catches up.
   */
  minReceiveRateBytesPerSecond?: number
  /** Sliding window the receive rate is measured over, in milliseconds; the first window is a grace period. */
  receiveRateWindowMs?: number
}

export type MultipartOptions = {
  /** Folder that holds each request's temporary files; they are removed once the handler returns. */
  tmpFolder: string
  /** Bounds the bytes spooled across concurrent requests, each file charged SPOOL_FILE_OVERHEAD_BYTES. */
  uploadBudget?: IUploadBudget
  /** Opens a temporary file for writing. */
  createWriteStream?: (filePath: string) => Writable
  /** Most time, in milliseconds, to flush the temporary files once the body is received. */
  spoolFlushTimeoutMs?: number
}

// Most framing busboy accepts per part: its 16 KiB header block plus an RFC 2046 boundary line (at most
// 70 bytes) and CRLFs. It never reaches disk.
export const MULTIPART_PART_FRAMING_BYTES = 16 * 1024 + 128

/** Largest body a request within `limits` can have: its payload plus the framing of every part. */
export function maxMultipartBodySize(limits: MultipartLimits): number | undefined {
  const { maxTotalSize, maxFiles, maxFields } = limits
  if (maxTotalSize === undefined || maxFiles === undefined || maxFields === undefined) {
    return undefined
  }
  // One more part's worth covers the closing boundary and any preamble or epilogue.
  return maxTotalSize + (maxFiles + maxFields + 1) * MULTIPART_PART_FRAMING_BYTES
}

// Samples of the received bytes per receive-rate window, so the window slides in quarter steps.
const RECEIVE_RATE_SAMPLES_PER_WINDOW = 4

// Temporary files a request writes at once: busboy moves to the next part while earlier files are
// still flushing, so without a cap one request could hold a descriptor per part.
export const MAX_OPEN_SPOOL_FILES = 8

// Once the body is parsed only the last buffered chunks of the open files remain to flush, so this is
// only reached by a stuck disk; the upload then fails with 503 rather than holding its budget share.
export const DEFAULT_SPOOL_FLUSH_TIMEOUT_MS = 60_000

/** Formats milliseconds as seconds for a client-facing message, e.g. 300000 → "300", 50 → "0.05". */
export function formatSeconds(ms: number): string {
  return String(Number((ms / 1000).toFixed(3)))
}

/** The 408 message for a body that did not arrive within `timeoutMs`, with what did arrive. */
export function uploadTimedOutMessage(timeoutMs: number, receivedBytes: number, declaredBytes?: number): string {
  const received = declaredBytes === undefined ? `${receivedBytes}` : `${receivedBytes} of ${declaredBytes}`
  return (
    `The upload did not finish within ${formatSeconds(timeoutMs)} s: received ${received} bytes. ` +
    'Retry on a faster connection or send smaller batches.'
  )
}

const formatKiBPerSecond = (bytesPerSecond: number): string => String(Number((bytesPerSecond / 1024).toFixed(1)))

/** The 408 message for a body arriving under the minimum rate, with the measured and required rates. */
export function uploadTooSlowMessage(receivedBytes: number, elapsedMs: number, minBytesPerSecond: number): string {
  const rate = (receivedBytes * 1000) / elapsedMs
  return (
    `The upload was too slow: received ${receivedBytes} bytes in the last ${formatSeconds(elapsedMs)} s ` +
    `(${formatKiBPerSecond(rate)} KiB/s), below the minimum of ${formatKiBPerSecond(minBytesPerSecond)} KiB/s. ` +
    'Retry on a faster connection or send smaller batches.'
  )
}

export function multipartParserWrapper<U, Ctx extends FormDataContext<U>, T extends IHttpServerComponent.IResponse>(
  handler: (ctx: Ctx) => Promise<T>,
  limits: MultipartLimits,
  options: MultipartOptions
): (ctx: IHttpServerComponent.DefaultContext<U>) => Promise<T> {
  const maxBodySize = maxMultipartBodySize(limits)

  return async function (ctx: IHttpServerComponent.DefaultContext<U>): Promise<T> {
    const { maxTotalSize } = limits

    // Reject an upload whose declared Content-Length can't fit a valid body, before we read any of it.
    // A body without Content-Length is bounded as it arrives, by both its payload and its whole size.
    const declaredSize = parseInt(ctx.request.headers.get('content-length') || '', 10)
    if (maxBodySize !== undefined && !isNaN(declaredSize) && declaredSize > maxBodySize) {
      throw bodyTooLarge()
    }

    // Reserve the declared size before reading the body, so a full budget sheds the upload unread. Framing
    // never reaches disk, so it is capped at the payload limit; file overheads are charged per part.
    const initialReservation =
      Number.isSafeInteger(declaredSize) && declaredSize > 0 ? Math.min(declaredSize, maxTotalSize ?? Infinity) : 0
    let lease: UploadBudgetLease | undefined
    try {
      lease = options.uploadBudget?.acquire(initialReservation)
    } catch (error) {
      if (error instanceof UploadBudgetExceededError) {
        throw new ServiceUnavailableError(error.message)
      }
      throw error
    }
    try {
      return await parseAndHandle(ctx, lease, initialReservation)
    } finally {
      // The temporary files are removed by the time this runs.
      lease?.release()
    }
  }

  // Aborts a body that arrives slower than the minimum rate, so a stalled sender can't hold its upload
  // slot and disk reservation until the upload timeout. The window slides over `waitedMs`, the time spent
  // waiting on the client, so a spool that backpressures the body never counts against its sender.
  function startReceiveRateCheck(
    receivedBytes: () => number,
    waitedMs: () => number,
    abort: (error: Error) => void
  ): NodeJS.Timeout | undefined {
    const { minReceiveRateBytesPerSecond: minRate, receiveRateWindowMs: windowMs } = limits
    if (!minRate || !windowMs) {
      return undefined
    }
    const minWindowBytes = (minRate * windowMs) / 1000
    const samples = [{ at: 0, bytes: 0 }]
    return setInterval(() => {
      const latest = { at: waitedMs(), bytes: receivedBytes() }
      if (latest.at === samples[samples.length - 1].at) {
        return
      }
      // The window starts at the newest sample at least a window old.
      while (samples.length > 1 && latest.at - samples[1].at >= windowMs) {
        samples.shift()
      }
      const received = latest.bytes - samples[0].bytes
      const elapsedMs = latest.at - samples[0].at
      if (elapsedMs >= windowMs && received < minWindowBytes) {
        abort(new RequestTimeoutError(uploadTooSlowMessage(received, elapsedMs, minRate)))
      }
      samples.push(latest)
    }, windowMs / RECEIVE_RATE_SAMPLES_PER_WINDOW)
  }

  function bodyTooLarge(): PayloadTooLargeError {
    return new PayloadTooLargeError(
      `The request body is too large. The maximum allowed total upload size is ${limits.maxTotalSize} bytes ` +
        `plus multipart framing (${maxBodySize} bytes in all).`
    )
  }

  async function parseAndHandle(
    ctx: IHttpServerComponent.DefaultContext<U>,
    lease: UploadBudgetLease | undefined,
    initialReservation: number
  ): Promise<T> {
    const { maxTotalSize } = limits

    let formDataParser: ReturnType<typeof busboy>
    try {
      formDataParser = busboy({
        headers: {
          'content-type': ctx.request.headers.get('content-type') || undefined
        },
        limits: {
          fileSize: limits.maxFileSize,
          files: limits.maxFiles,
          fields: limits.maxFields,
          fieldSize: limits.maxFieldSize
        }
      })
    } catch {
      // busboy throws synchronously when the Content-Type isn't multipart/form-data. Surface it as a
      // client error (400) rather than letting it bubble up as an internal server error (500).
      throw new InvalidRequestError('Invalid request: expected a multipart/form-data body')
    }

    // Recreated if a temp-folder cleaner removed it while this process was idle.
    await mkdir(options.tmpFolder, { recursive: true })
    const directory = await mkdtemp(path.join(options.tmpFolder, 'upload-'))
    const openWriter = options.createWriteStream ?? createWriteStream
    const writers = new Set<Writable>()
    // Parts paused until a temporary file slot frees up.
    const waitingParts: Array<() => void> = []
    const writes: Promise<void>[] = []
    try {
      // Null-prototype maps so that an attacker-controlled field/file name such as `__proto__` or
      // `constructor` is stored as a plain key instead of mutating the object's prototype.
      const fields: Record<string, Field> = Object.create(null)
      const files: Record<string, SpooledFile> = Object.create(null)
      // Every form name may appear once: a repeated part would be received but only one copy kept.
      const seenNames = new Set<string>()
      const rejectIfDuplicate = (name: string): boolean => {
        if (seenNames.has(name)) {
          abort(new InvalidRequestError(`Duplicate form field '${name}'`))
          return true
        }
        seenNames.add(name)
        return false
      }

      // Cumulative bytes seen across every file and field. The per-file/per-field caps don't bound the
      // sum (a request may carry many files/fields), so track the total and reject once it crosses
      // `maxTotalSize`.
      let totalBytes = 0
      let spooledFiles = 0
      let reservedBytes = initialReservation
      // Set once any limit is hit. `abort` destroys the parser exactly once, and the field/file
      // handlers short-circuit on `aborted` — so in-flight chunks aren't counted after a rejection
      // and destroy() is never called more than once.
      let aborted = false
      // The first rejection wins over whatever the torn-down pipeline reports.
      let abortReason: Error | undefined
      // A temporary file that can't be written is a server failure, not a malformed request.
      let writeError: Error | undefined
      const abort = (error: Error): void => {
        if (aborted) {
          return
        }
        aborted = true
        abortReason = error
        waitingParts.length = 0
        formDataParser.destroy(error)
        for (const writer of writers) {
          writer.destroy()
        }
      }
      const rejectIfOverTotal = (): boolean => {
        // Checked before growing the reservation: an oversize body gets a final 413, never a retryable 503.
        if (maxTotalSize !== undefined && totalBytes > maxTotalSize) {
          abort(
            new PayloadTooLargeError(
              `The request body is too large. The maximum allowed total upload size is ${maxTotalSize} bytes.`
            )
          )
          return true
        }
        return rejectIfOverBudget()
      }
      // Grows the reservation to the spool's disk footprint when it outgrows the declared size (or lack of one).
      const rejectIfOverBudget = (): boolean => {
        const footprint = totalBytes + spooledFiles * SPOOL_FILE_OVERHEAD_BYTES
        if (lease && footprint > reservedBytes) {
          if (!lease.resize(footprint)) {
            abort(new ServiceUnavailableError('Server is handling too many uploads, please retry shortly.'))
            return true
          }
          reservedBytes = footprint
        }
        return false
      }
      // Charged on the part's headers, before its temporary file exists.
      const rejectIfNoRoomForFile = (): boolean => {
        spooledFiles++
        return rejectIfOverBudget()
      }

      // Emitted once more files than `maxFiles` are seen. Reject instead of dropping them silently.
      formDataParser.on('filesLimit', function () {
        abort(new PayloadTooLargeError(`Too many files in the request. The maximum allowed is ${limits.maxFiles}.`))
      })

      // Emitted once more than `maxFields` non-file fields are seen. Bounds the in-memory `fields`
      // object and any downstream per-field work (e.g. the auth-chain index scan) so a request with a
      // huge number of fields can't exhaust memory/CPU.
      formDataParser.on('fieldsLimit', function () {
        abort(
          new PayloadTooLargeError(`Too many form fields in the request. The maximum allowed is ${limits.maxFields}.`)
        )
      })

      formDataParser.on('field', function (name, value, info) {
        if (aborted) {
          return
        }
        // busboy truncates a field value larger than `maxFieldSize` (setting valueTruncated); reject
        // rather than store a partial value.
        if (info.valueTruncated) {
          abort(
            new PayloadTooLargeError(
              `Field '${name}' is too large. The maximum allowed size per field is ${limits.maxFieldSize} bytes.`
            )
          )
          return
        }
        if (rejectIfDuplicate(name)) {
          return
        }
        totalBytes += Buffer.byteLength(value)
        if (rejectIfOverTotal()) {
          return
        }
        fields[name] = Object.assign({ fieldname: name, value }, info)
      })

      formDataParser.on('file', function (name, stream, info) {
        // Checked on the part's headers, before a temporary file is opened for it.
        if (aborted || rejectIfDuplicate(name) || rejectIfNoRoomForFile()) {
          // Destroying the parser errors the open part's stream too.
          stream.on('error', () => undefined).resume()
          return
        }
        const part = spooledFiles - 1
        const spool = (): void => {
          // Temporary names are sequence numbers: field names are client-controlled.
          const filePath = path.join(directory, String(part))
          const writer = openWriter(filePath)
          writers.add(writer)
          let size = 0
          writes.push(
            new Promise<void>((resolve) => {
              writer.on('finish', function () {
                if (!aborted) {
                  files[name] = Object.assign({}, info, { fieldname: name, path: filePath, size })
                }
              })
              writer.on('error', function (error: Error) {
                writeError = writeError ?? error
                abort(error)
              })
              writer.on('close', function () {
                writers.delete(writer)
                resolve()
                if (!aborted) {
                  waitingParts.shift()?.()
                }
              })
            })
          )
          stream.on('data', function (data: Buffer) {
            if (aborted) {
              return
            }
            size += data.length
            totalBytes += data.length
            rejectIfOverTotal()
          })
          stream.pipe(writer)
        }
        // Emitted when the file exceeds `maxFileSize`. busboy truncates the stream, so we
        // must reject rather than store partial (and therefore wrong-hash) content.
        stream.on('limit', function () {
          abort(
            new PayloadTooLargeError(
              `File '${info.filename}' is too large. The maximum allowed size per file is ${limits.maxFileSize} bytes.`
            )
          )
        })
        stream.on('error', function (err: Error) {
          abort(err)
        })
        if (writers.size >= MAX_OPEN_SPOOL_FILES) {
          // Pausing the part backpressures busboy and the request body until a file closes.
          stream.pause()
          waitingParts.push(spool)
        } else {
          spool()
        }
      })

      // @dcl/http-server v2 hands handlers a native `Request`, whose `body` is a web `ReadableStream`
      // rather than a Node stream. Adapt it so it can be piped into busboy. The cast bridges the
      // lib.dom `ReadableStream` type to the `node:stream/web` one that `Readable.fromWeb` expects.
      const requestBody = ctx.request.body as unknown as Parameters<typeof Readable.fromWeb>[0] | null
      const source = requestBody ? Readable.fromWeb(requestBody) : Readable.from([])
      // busboy skips preambles, epilogues and unnamed parts without reporting their bytes.
      let bodyBytes = 0
      // Time spent waiting for the next chunk; time suspended at `yield` is the parser backpressuring.
      let waitedMs = 0
      let waitingSince: number | undefined
      const waited = (): number => waitedMs + (waitingSince === undefined ? 0 : Date.now() - waitingSince)
      const countBody = async function* (chunks: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
        waitingSince = Date.now()
        for await (const chunk of chunks) {
          waitedMs = waited()
          waitingSince = undefined
          bodyBytes += chunk.byteLength
          if (maxBodySize !== undefined && bodyBytes > maxBodySize) {
            const error = bodyTooLarge()
            abort(error)
            throw error
          }
          yield chunk
          waitingSince = Date.now()
        }
        waitedMs = waited()
        waitingSince = undefined
      }

      // `pipeline` tears down *both* streams if either errors: when a limit handler calls `abort()`
      // (destroying the parser) the request body (a web stream) is cancelled and the upload is aborted,
      // and a client that disconnects mid-upload rejects here — instead of leaving the parser and an
      // unsettled promise dangling (a slow resource leak).
      // The timeout is wall-clock, so it bounds how long a body holds its share whatever slows it.
      const { uploadTimeoutMs } = limits
      const declaredSize = parseInt(ctx.request.headers.get('content-length') || '', 10)
      const timeout =
        uploadTimeoutMs === undefined
          ? undefined
          : setTimeout(
              () =>
                abort(
                  new RequestTimeoutError(
                    uploadTimedOutMessage(
                      uploadTimeoutMs,
                      bodyBytes,
                      Number.isSafeInteger(declaredSize) ? declaredSize : undefined
                    )
                  )
                ),
              uploadTimeoutMs
            )
      const rateCheck = startReceiveRateCheck(() => bodyBytes, waited, abort)
      try {
        await pipeline(source, countBody, formDataParser)
      } catch (error) {
        if (writeError) {
          throw writeError
        }
        const failure = abortReason ?? error
        // Our own rejections keep their status. Any other failure means we couldn't parse the
        // request body (a malformed, truncated, or empty multipart body, or a mid-upload disconnect) —
        // that's a client error (400), not an internal 500.
        if (
          failure instanceof InvalidRequestError ||
          failure instanceof PayloadTooLargeError ||
          failure instanceof ServiceUnavailableError ||
          failure instanceof RequestTimeoutError
        ) {
          throw failure
        }
        throw new InvalidRequestError('Invalid multipart/form-data request')
      } finally {
        clearTimeout(timeout)
        clearInterval(rateCheck)
      }
      // The body is received: a slow flush is the server's, so it gets its own bound and a retryable 503.
      const flushTimeout = setTimeout(
        () => abort(new ServiceUnavailableError('The upload could not be stored in time, please retry shortly.')),
        options.spoolFlushTimeoutMs ?? DEFAULT_SPOOL_FLUSH_TIMEOUT_MS
      )
      try {
        // busboy finishes before the last temporary files are flushed.
        await Promise.all(writes)
      } finally {
        clearTimeout(flushTimeout)
      }
      if (writeError) {
        throw writeError
      }
      if (abortReason) {
        throw abortReason
      }
      // The handler runs holding only what the spool uses, not the declared framing.
      const footprint = totalBytes + spooledFiles * SPOOL_FILE_OVERHEAD_BYTES
      if (lease && footprint < reservedBytes && lease.resize(footprint)) {
        reservedBytes = footprint
      }

      const newContext = Object.assign(Object.create(ctx), { formData: { fields, files } })
      return await handler(newContext as Ctx)
    } finally {
      for (const writer of writers) {
        writer.destroy()
      }
      await Promise.allSettled(writes)
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
