import { IHttpServerComponent } from '@dcl/core-commons'
import { Field, File } from '@well-known-components/multipart-wrapper'
import busboy from 'busboy'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { FormDataContext } from '../types'
import { IUploadBudget, UploadBudgetExceededError, UploadBudgetLease } from '../adapters/upload-budget'
import { InvalidRequestError, PayloadTooLargeError, RequestTimeoutError, ServiceUnavailableError } from './errors'

/**
 * Limits applied to a multipart request before its contents are buffered into memory.
 *
 * The upstream `@well-known-components/multipart-wrapper` buffers every uploaded file
 * fully in memory (`Buffer.concat`) with no bound, and this happens *before* any
 * authentication/validation runs — so an unauthenticated client can exhaust memory by
 * streaming a large body. This wrapper is a drop-in replacement that wires `busboy`'s
 * native limits and rejects (HTTP 413) as soon as a limit is exceeded, instead of
 * silently buffering or truncating.
 *
 * `maxTotalSize` additionally bounds the cumulative body size across all files and fields (and is
 * pre-checked against the declared Content-Length). The wrapper still buffers files in memory, so a
 * reverse-proxy / load-balancer body cap remains a sensible extra layer for very large uploads.
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

export function multipartParserWrapper<U, Ctx extends FormDataContext<U>, T extends IHttpServerComponent.IResponse>(
  handler: (ctx: Ctx) => Promise<T>,
  limits: MultipartLimits = {},
  uploadBudget?: IUploadBudget
): (ctx: IHttpServerComponent.DefaultContext<U>) => Promise<T> {
  return async function (ctx: IHttpServerComponent.DefaultContext<U>): Promise<T> {
    const { maxTotalSize } = limits

    // Reject an upload whose declared Content-Length already exceeds the total budget, before we read
    // (and buffer) any of the body. A request that lies about or omits Content-Length is still bounded
    // by the cumulative `totalBytes` guard below, which stops once the buffered bytes exceed the cap.
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
      lease = uploadBudget?.acquire(initialReservation)
    } catch (error) {
      if (error instanceof UploadBudgetExceededError) {
        throw new ServiceUnavailableError(error.message)
      }
      throw error
    }
    try {
      return await parseAndHandle(ctx, lease, initialReservation)
    } finally {
      // Files stay buffered until the handler returns.
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

    // Null-prototype maps so that an attacker-controlled field/file name such as `__proto__` or
    // `constructor` is stored as a plain key instead of mutating the object's prototype.
    const fields: Record<string, Field> = Object.create(null)
    const files: Record<string, File> = Object.create(null)
    // Every form name may appear once: a repeated part would be buffered but only one copy kept.
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
    // sum (a request may carry many files/fields), and this wrapper buffers everything in memory, so
    // track the total and reject once it crosses `maxTotalSize`.
    let totalBytes = 0
    // Set once any limit is hit. `abort` destroys the parser exactly once, and the field/file
    // handlers short-circuit on `aborted` — so in-flight chunks aren't buffered after a rejection
    // (bounding the overshoot past a limit) and destroy() is never called more than once.
    let aborted = false
    const abort = (error: Error): void => {
      if (aborted) {
        return
      }
      aborted = true
      formDataParser.destroy(error)
    }
    let reservedBytes = initialReservation
    // With a declared size, files are copied into one buffer of that size, so the reservation is the peak.
    const declaredBody = initialReservation > 0 ? createDeclaredBodyBuffer(initialReservation) : undefined
    const rejectIfOverTotal = (): boolean => {
      // Over the limit is final (413), so check it before a full budget could answer a retryable 503.
      if (maxTotalSize !== undefined && totalBytes > maxTotalSize) {
        abort(
          new PayloadTooLargeError(
            `The request body is too large. The maximum allowed total upload size is ${maxTotalSize} bytes.`
          )
        )
        return true
      }
      if (totalBytes > reservedBytes) {
        if (declaredBody) {
          abort(new InvalidRequestError('The request body is larger than its declared Content-Length.'))
          return true
        }
        // A body without a declared size grows the reservation as it arrives.
        if (lease) {
          if (!lease.resize(totalBytes)) {
            abort(new ServiceUnavailableError('Server is buffering too many uploads, please retry shortly.'))
            return true
          }
          reservedBytes = totalBytes
        }
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
      // Checked on the part's headers, before any of its bytes are buffered.
      if (aborted || rejectIfDuplicate(name)) {
        // Destroying the parser errors the open part's stream too.
        stream.on('error', () => undefined).resume()
        return
      }
      const declaredFile = declaredBody?.openFile()
      const chunks: Buffer[] = []
      stream.on('data', function (data: Buffer) {
        if (aborted) {
          return
        }
        totalBytes += data.length
        if (rejectIfOverTotal()) {
          return
        }
        if (!declaredFile) {
          chunks.push(data)
        } else if (!declaredFile.write(data)) {
          abort(new Error('Multipart file data arrived out of order'))
        }
      })
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
      stream.on('end', function () {
        if (aborted) {
          return
        }
        if (declaredFile) {
          files[name] = Object.assign(Object.assign({}, info), { fieldname: name, value: declaredFile.contents() })
          return
        }
        // Without a declared size, concatenating briefly holds a second copy, so reserve it meanwhile.
        const fileBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        if (lease && !lease.resize(reservedBytes + fileBytes)) {
          abort(new ServiceUnavailableError('Server is buffering too many uploads, please retry shortly.'))
          return
        }
        files[name] = Object.assign(Object.assign({}, info), { fieldname: name, value: Buffer.concat(chunks) })
        chunks.length = 0
        lease?.resize(reservedBytes)
      })
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
    } catch (error) {
      // Our own rejections keep their status (400, 413, 503, 408). Any other failure means we couldn't
      // parse the request body (a malformed, truncated, or empty multipart body, or a mid-upload
      // disconnect) — that's a client error (400), not an internal 500.
      if (
        error instanceof InvalidRequestError ||
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

    const newContext = Object.assign(Object.create(ctx), { formData: { fields, files } })
    return handler(newContext as Ctx)
  }
}

/**
 * One allocation of a request's declared size that its files are copied into back to back, so they
 * never hold more memory than was reserved for the request.
 */
function createDeclaredBodyBuffer(capacity: number) {
  let buffer: Buffer | undefined
  let used = 0
  return {
    /** Starts a file. Its bytes must all arrive before the next file's, as busboy parses parts in order. */
    openFile() {
      let start = -1
      let end = -1
      return {
        /** Appends a chunk. Returns false when another file wrote in between or the capacity is exceeded. */
        write(chunk: Buffer): boolean {
          if (start === -1) {
            start = end = used
          }
          if (end !== used || used + chunk.length > capacity) {
            return false
          }
          buffer ??= Buffer.allocUnsafe(capacity)
          chunk.copy(buffer, used)
          used += chunk.length
          end = used
          return true
        },
        /** The file's bytes, a view into the shared buffer. */
        contents(): Buffer {
          return buffer && start !== -1 ? buffer.subarray(start, end) : Buffer.alloc(0)
        }
      }
    }
  }
}
