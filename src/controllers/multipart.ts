import { IHttpServerComponent } from '@dcl/core-commons'
import { Field } from '@well-known-components/multipart-wrapper'
import busboy from 'busboy'
import { createWriteStream } from 'fs'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import path from 'path'
import { Readable, Writable } from 'stream'
import { pipeline } from 'stream/promises'
import { FormDataContext, SpooledFile } from '../types'
import { IUploadBudget, UploadBudgetExceededError, UploadBudgetLease } from '../adapters/upload-budget'
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
 * `maxTotalSize` additionally bounds the cumulative body size across all files and fields (and is
 * pre-checked against the declared Content-Length).
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
}

export type MultipartOptions = {
  /** Folder that holds each request's temporary files; they are removed once the handler returns. */
  tmpFolder: string
  /** Bounds the bytes spooled across concurrent requests. */
  uploadBudget?: IUploadBudget
  /** Opens a temporary file for writing. */
  createWriteStream?: (filePath: string) => Writable
}

// Temporary files a request writes at once: busboy moves to the next part while earlier files are
// still flushing, so without a cap one request could hold a descriptor per part.
export const MAX_OPEN_SPOOL_FILES = 8

export function multipartParserWrapper<U, Ctx extends FormDataContext<U>, T extends IHttpServerComponent.IResponse>(
  handler: (ctx: Ctx) => Promise<T>,
  limits: MultipartLimits,
  options: MultipartOptions
): (ctx: IHttpServerComponent.DefaultContext<U>) => Promise<T> {
  return async function (ctx: IHttpServerComponent.DefaultContext<U>): Promise<T> {
    const { maxTotalSize } = limits

    // Reject an upload whose declared Content-Length already exceeds the total budget, before we read
    // any of the body. A request that lies about or omits Content-Length is still bounded by the
    // cumulative `totalBytes` guard below, which stops once the received bytes exceed the cap.
    const declaredSize = parseInt(ctx.request.headers.get('content-length') || '', 10)
    if (maxTotalSize !== undefined && !isNaN(declaredSize) && declaredSize > maxTotalSize) {
      throw new PayloadTooLargeError(
        `The request body is too large. The maximum allowed total upload size is ${maxTotalSize} bytes.`
      )
    }

    // Reserve the declared size before reading the body, so a full budget sheds the upload unread.
    const initialReservation = Number.isSafeInteger(declaredSize) && declaredSize > 0 ? declaredSize : 0
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

    // Recreated if an overlapping process's startup removed it while this one was idle.
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

      // Cumulative bytes seen across every file and field. The per-file/per-field caps don't bound the
      // sum (a request may carry many files/fields), so track the total and reject once it crosses
      // `maxTotalSize`.
      let totalBytes = 0
      let reservedBytes = initialReservation
      // Set once any limit is hit. `abort` destroys the parser exactly once, and the field/file
      // handlers short-circuit on `aborted` — so in-flight chunks aren't counted after a rejection
      // and destroy() is never called more than once.
      let aborted = false
      // A temporary file that can't be written is a server failure, not a malformed request.
      let writeError: Error | undefined
      const abort = (error: Error): void => {
        if (aborted) {
          return
        }
        aborted = true
        waitingParts.length = 0
        formDataParser.destroy(error)
        for (const writer of writers) {
          writer.destroy()
        }
      }
      const rejectIfOverTotal = (): boolean => {
        // A body larger than its declared size (or without one) grows the reservation as it arrives.
        if (lease && totalBytes > reservedBytes) {
          if (!lease.resize(totalBytes)) {
            abort(new ServiceUnavailableError('Server is buffering too many uploads, please retry shortly.'))
            return true
          }
          reservedBytes = totalBytes
        }
        if (maxTotalSize !== undefined && totalBytes > maxTotalSize) {
          abort(
            new PayloadTooLargeError(
              `The request body is too large. The maximum allowed total upload size is ${maxTotalSize} bytes.`
            )
          )
          return true
        }
        return false
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
        totalBytes += Buffer.byteLength(value)
        if (rejectIfOverTotal()) {
          return
        }
        fields[name] = Object.assign({ fieldname: name, value }, info)
      })

      let fileCount = 0
      // The last part sent under a field name wins, whichever file finishes flushing last.
      const latestPart: Record<string, number> = Object.create(null)
      formDataParser.on('file', function (name, stream, info) {
        if (aborted) {
          stream.resume()
          return
        }
        const part = fileCount++
        latestPart[name] = part
        const spool = (): void => {
          // Temporary names are sequence numbers: field names are client-controlled.
          const filePath = path.join(directory, String(part))
          const writer = openWriter(filePath)
          writers.add(writer)
          let size = 0
          writes.push(
            new Promise<void>((resolve) => {
              writer.on('finish', function () {
                if (!aborted && latestPart[name] === part) {
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

      // `pipeline` tears down *both* streams if either errors: when a limit handler calls `abort()`
      // (destroying the parser) the request body (a web stream) is cancelled and the upload is aborted,
      // and a client that disconnects mid-upload rejects here — instead of leaving the parser and an
      // unsettled promise dangling (a slow resource leak).
      const timeout =
        limits.uploadTimeoutMs === undefined
          ? undefined
          : setTimeout(() => abort(new RequestTimeoutError('The multipart upload timed out.')), limits.uploadTimeoutMs)
      try {
        await pipeline(source, formDataParser)
        // busboy finishes before the last temporary files are flushed.
        await Promise.all(writes)
      } catch (error) {
        if (writeError) {
          throw writeError
        }
        // Our own limit rejections keep their status. Any other failure means we couldn't parse the
        // request body (a malformed, truncated, or empty multipart body, or a mid-upload disconnect) —
        // that's a client error (400), not an internal 500.
        if (
          error instanceof PayloadTooLargeError ||
          error instanceof ServiceUnavailableError ||
          error instanceof RequestTimeoutError
        ) {
          throw error
        }
        throw new InvalidRequestError('Invalid multipart/form-data request')
      } finally {
        clearTimeout(timeout)
      }
      if (writeError) {
        throw writeError
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
