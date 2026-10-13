import { IHttpServerComponent } from '@dcl/core-commons'
import { Field } from '@well-known-components/multipart-wrapper'
import busboy from 'busboy'
import { createWriteStream } from 'fs'
import { rm } from 'fs/promises'
import path from 'path'
import { Readable, Writable } from 'stream'
import { pipeline } from 'stream/promises'
import { AppComponents, FormDataContext, SpooledFile } from '../types'
import {
  IUploadBudget,
  SPOOL_FILE_OVERHEAD_BYTES,
  UploadBudgetExceededError,
  UploadBudgetLease
} from '../adapters/upload-budget'
import { IUploadSpool, UploadSpoolStoppedError } from '../adapters/upload-spool'
import {
  ClientClosedRequestError,
  InvalidRequestError,
  PayloadTooLargeError,
  RequestTimeoutError,
  ServiceUnavailableError
} from './errors'

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
  /** Least rate, in bytes per second, a body must keep arriving at over any receive window; 0 or unset disables it. */
  minReceiveBytesPerSecond?: number
  /** Time, in milliseconds, the receive rate is measured over; the first check runs once one has passed. */
  receiveRateWindowMs?: number
}

export type MultipartOptions = {
  /** Creates the folder that holds a request's temporary files; they are removed once the handler returns. */
  spool: Pick<IUploadSpool, 'createRequestFolder'>
  /** Bounds the bytes spooled across concurrent requests, each file charged SPOOL_FILE_OVERHEAD_BYTES. */
  uploadBudget?: IUploadBudget
  /** Opens a temporary file for writing. */
  createWriteStream?: (filePath: string) => Writable
  /** Most time, in milliseconds, to flush the temporary files once the body is received. */
  spoolFlushTimeoutMs?: number
  /** Counts upload timeouts, aborted uploads and spool failures. */
  metrics?: Pick<AppComponents['metrics'], 'increment'>
  /** Logs spool failures the client only sees as a retryable 503. */
  logs?: Pick<AppComponents['logs'], 'getLogger'>
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

// Temporary files a request writes at once: busboy moves to the next part while earlier files are
// still flushing, so without a cap one request could hold a descriptor per part.
export const MAX_OPEN_SPOOL_FILES = 8

// Once the body is parsed only the last buffered chunks of the open files remain to flush, so this is
// only reached by a stuck disk; the upload then fails with 503 rather than holding its budget share.
export const DEFAULT_SPOOL_FLUSH_TIMEOUT_MS = 60_000

// Long enough to ride out TCP slow start and short proxy or network stalls (at 64 KiB/s a sender may stall
// for most of it after a burst), short enough that a stalled body holds its upload slot for seconds, not minutes.
export const DEFAULT_RECEIVE_RATE_WINDOW_MS = 10_000

const SPOOL_UNAVAILABLE_MESSAGE = 'The server cannot store uploads right now, please retry shortly.'

/** Formats milliseconds as seconds for a client-facing message, e.g. 300000 → "300", 50 → "0.05". */
export function formatSeconds(ms: number): string {
  return String(Number((ms / 1000).toFixed(3)))
}

/** Formats a rate in bytes per second as KiB/s for a client-facing message, e.g. 65536 → "64". */
export function formatKiBPerSecond(bytesPerSecond: number): string {
  return String(Number((bytesPerSecond / 1024).toFixed(2)))
}

function bytesPerSecond(bytes: number, ms: number): number {
  return ms > 0 ? (bytes * 1000) / ms : 0
}

/** The 408 message for a body that did not arrive within `timeoutMs`, with what did arrive. */
export function uploadTimedOutMessage(timeoutMs: number, receivedBytes: number, declaredBytes?: number): string {
  const received = declaredBytes === undefined ? `${receivedBytes}` : `${receivedBytes} of ${declaredBytes}`
  return (
    `The upload did not finish within ${formatSeconds(timeoutMs)} s: received ${received} bytes ` +
    `(${formatKiBPerSecond(bytesPerSecond(receivedBytes, timeoutMs))} KiB/s). ` +
    'Retry on a faster connection or send smaller batches.'
  )
}

/** The 408 message for a body arriving slower than `minBytesPerSecond`: the measured vs the required rate. */
export function uploadTooSlowMessage(receivedBytes: number, elapsedMs: number, minBytesPerSecond: number): string {
  return (
    `The upload is too slow: received ${receivedBytes} bytes in ${formatSeconds(elapsedMs)} s ` +
    `(${formatKiBPerSecond(bytesPerSecond(receivedBytes, elapsedMs))} KiB/s), ` +
    `below the required ${formatKiBPerSecond(minBytesPerSecond)} KiB/s. Retry on a faster connection.`
  )
}

export function multipartParserWrapper<U, Ctx extends FormDataContext<U>, T extends IHttpServerComponent.IResponse>(
  handler: (ctx: Ctx) => Promise<T>,
  limits: MultipartLimits,
  options: MultipartOptions
): (ctx: IHttpServerComponent.DefaultContext<U>) => Promise<T> {
  const maxBodySize = maxMultipartBodySize(limits)
  const logger = options.logs?.getLogger('multipart')

  return async function (ctx: IHttpServerComponent.DefaultContext<U>): Promise<T> {
    const { maxTotalSize } = limits

    // Reject an upload whose declared Content-Length can't fit a valid body, before we read any of it.
    // A body without Content-Length is bounded as it arrives, by both its payload and its whole size.
    const declaredSize = parseInt(ctx.request.headers.get('content-length') || '', 10)
    if (maxBodySize !== undefined && !isNaN(declaredSize) && declaredSize > maxBodySize) {
      throw bodyTooLarge()
    }

    // Admit on the declared size before reading the body, so a full budget sheds the upload unread, but
    // reserve only the minimum: the reservation grows with the bytes spooled, so a body declaring more than
    // it sends never holds budget it doesn't use. Framing never reaches disk, so it is capped at the payload
    // limit; file overheads are charged per part.
    const declaredPayload =
      Number.isSafeInteger(declaredSize) && declaredSize > 0 ? Math.min(declaredSize, maxTotalSize ?? Infinity) : 0
    let lease: UploadBudgetLease | undefined
    try {
      lease = options.uploadBudget?.acquire(0, declaredPayload)
    } catch (error) {
      if (error instanceof UploadBudgetExceededError) {
        throw new ServiceUnavailableError(error.message)
      }
      throw error
    }
    try {
      return await parseAndHandle(ctx, lease)
    } finally {
      // Runs once removing the temporary files has finished or failed.
      lease?.release()
    }
  }

  function bodyTooLarge(): PayloadTooLargeError {
    return new PayloadTooLargeError(
      `The request body is too large. The maximum allowed total upload size is ${limits.maxTotalSize} bytes ` +
        `plus multipart framing (${maxBodySize} bytes in all).`
    )
  }

  // A spool disk that can't be written is the server's and may clear, so the client retries.
  function spoolUnavailable(reason: string, message: string, error: unknown): ServiceUnavailableError {
    options.metrics?.increment('dcl_upload_spool_failures_total', { reason })
    logger?.error(message, {
      code: (error as NodeJS.ErrnoException)?.code ?? 'unknown',
      error: error instanceof Error ? error.message : String(error)
    })
    return new ServiceUnavailableError(SPOOL_UNAVAILABLE_MESSAGE)
  }

  async function parseAndHandle(
    ctx: IHttpServerComponent.DefaultContext<U>,
    lease: UploadBudgetLease | undefined
  ): Promise<T> {
    const { maxTotalSize } = limits

    let formDataParser: ReturnType<typeof busboy>
    try {
      formDataParser = busboy({
        headers: {
          'content-type': ctx.request.headers.get('content-type') || undefined
        },
        limits: {
          // busboy flags a file or value that reaches its size limit as truncated, so allow one more byte.
          fileSize: limits.maxFileSize === undefined ? undefined : limits.maxFileSize + 1,
          files: limits.maxFiles,
          fields: limits.maxFields,
          fieldSize: limits.maxFieldSize === undefined ? undefined : limits.maxFieldSize + 1
        }
      })
    } catch {
      // busboy throws synchronously when the Content-Type isn't multipart/form-data. Surface it as a
      // client error (400) rather than letting it bubble up as an internal server error (500).
      throw new InvalidRequestError('Invalid request: expected a multipart/form-data body')
    }

    let directory: string
    try {
      directory = await options.spool.createRequestFolder()
    } catch (error) {
      if (error instanceof UploadSpoolStoppedError) {
        throw new ServiceUnavailableError(error.message)
      }
      throw spoolUnavailable('folder', 'Failed to create an upload spool folder', error)
    }
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
      let reservedBytes = 0
      // Set once any limit is hit. `abort` destroys the parser exactly once, and the field/file
      // handlers short-circuit on `aborted` — so in-flight chunks aren't counted after a rejection
      // and destroy() is never called more than once.
      let aborted = false
      // The first rejection wins over whatever the torn-down pipeline reports.
      let abortReason: Error | undefined
      // A temporary file that can't be written (ENOSPC, EIO, EDQUOT...) is a retryable server failure.
      let writeError: ServiceUnavailableError | undefined
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
                writeError ??= spoolUnavailable('write_error', 'Failed to write an upload spool file', error)
                abort(writeError)
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
      // Time spent waiting for the client's next chunk; time our own backpressure (a slow disk) holds the
      // body back is excluded, so it never counts against the client's receive rate.
      let waitedMs = 0
      let waitingSince: number | undefined = Date.now()
      const countBody = async function* (chunks: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
        for await (const chunk of chunks) {
          waitedMs += Date.now() - (waitingSince ?? Date.now())
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
      }
      const clientTimeMs = (): number => waitedMs + (waitingSince === undefined ? 0 : Date.now() - waitingSince)

      // The request's signal aborts when the client disconnects (@dcl/http-server ties it to the socket).
      const signal: AbortSignal | undefined = ctx.request.signal
      const clientClosed = (): ClientClosedRequestError => {
        if (!aborted) {
          options.metrics?.increment('dcl_multipart_upload_aborts_total', { reason: 'client_closed' })
        }
        return new ClientClosedRequestError('The client closed the connection before the upload was received.')
      }
      const onClientClosed = (): void => abort(clientClosed())
      signal?.addEventListener('abort', onClientClosed)

      // `pipeline` tears down *both* streams if either errors: when a limit handler calls `abort()`
      // (destroying the parser) the request body (a web stream) is cancelled and the upload is aborted,
      // and a client that disconnects mid-upload rejects here — instead of leaving the parser and an
      // unsettled promise dangling (a slow resource leak).
      // The timeout is wall-clock, so it bounds how long a body holds its share whatever slows it.
      const { uploadTimeoutMs, minReceiveBytesPerSecond } = limits
      const declaredSize = parseInt(ctx.request.headers.get('content-length') || '', 10)
      const timeout =
        uploadTimeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              if (!aborted) {
                options.metrics?.increment('dcl_multipart_upload_timeouts_total')
              }
              abort(
                new RequestTimeoutError(
                  uploadTimedOutMessage(
                    uploadTimeoutMs,
                    bodyBytes,
                    Number.isSafeInteger(declaredSize) ? declaredSize : undefined
                  )
                )
              )
            }, uploadTimeoutMs)
      // Within the wall-clock bound, a body must keep arriving at the minimum rate over every window of client
      // time, the first one included as its grace period. Rate-checking frees a stalled body's share early.
      const rateWindowMs = limits.receiveRateWindowMs ?? DEFAULT_RECEIVE_RATE_WINDOW_MS
      const samples = [{ at: 0, bytes: 0 }]
      const rateCheck = !minReceiveBytesPerSecond
        ? undefined
        : setInterval(() => {
            const at = clientTimeMs()
            // While the server holds the body back, client time stands still and nothing is sampled.
            if (at > samples[samples.length - 1].at) {
              samples.push({ at, bytes: bodyBytes })
            }
            // Keep the latest sample at or before the window start as its baseline.
            while (samples.length > 1 && samples[1].at <= at - rateWindowMs) {
              samples.shift()
            }
            const elapsedMs = at - samples[0].at
            const receivedBytes = bodyBytes - samples[0].bytes
            if (elapsedMs >= rateWindowMs && bytesPerSecond(receivedBytes, elapsedMs) < minReceiveBytesPerSecond) {
              if (!aborted) {
                options.metrics?.increment('dcl_multipart_upload_aborts_total', { reason: 'too_slow' })
              }
              abort(new RequestTimeoutError(uploadTooSlowMessage(receivedBytes, elapsedMs, minReceiveBytesPerSecond)))
            }
          }, rateWindowMs / 10)
      try {
        await pipeline(source, countBody, formDataParser)
      } catch (error) {
        // A disconnect may fail the body stream before the abort listener runs.
        const failure = abortReason ?? (signal?.aborted ? clientClosed() : error)
        // Our own rejections keep their status. Any other failure means we couldn't parse the
        // request body (a malformed, truncated, or empty multipart body) — that's a client error (400),
        // not an internal 500.
        if (
          failure instanceof InvalidRequestError ||
          failure instanceof PayloadTooLargeError ||
          failure instanceof ServiceUnavailableError ||
          failure instanceof RequestTimeoutError ||
          failure instanceof ClientClosedRequestError
        ) {
          throw failure
        }
        throw new InvalidRequestError('Invalid multipart/form-data request')
      } finally {
        clearTimeout(timeout)
        clearInterval(rateCheck)
        signal?.removeEventListener('abort', onClientClosed)
      }
      // The body is received: a slow flush is the server's, so it gets its own bound and a retryable 503.
      const flushTimeout = setTimeout(() => {
        if (!aborted) {
          options.metrics?.increment('dcl_upload_spool_failures_total', { reason: 'flush_timeout' })
        }
        abort(new ServiceUnavailableError('The upload could not be stored in time, please retry shortly.'))
      }, options.spoolFlushTimeoutMs ?? DEFAULT_SPOOL_FLUSH_TIMEOUT_MS)
      try {
        // busboy finishes before the last temporary files are flushed.
        await Promise.all(writes)
      } finally {
        clearTimeout(flushTimeout)
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
      // The lease is released even if removal fails; a leftover folder is no longer counted and is only
      // reclaimed after this process exits, by the next startup on this host.
      await rm(directory, { recursive: true, force: true }).catch(() =>
        options.metrics?.increment('dcl_upload_spool_failures_total', { reason: 'cleanup' })
      )
    }
  }
}
