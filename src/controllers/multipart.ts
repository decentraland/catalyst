import { IHttpServerComponent } from '@dcl/core-commons'
import { Field, File } from '@well-known-components/multipart-wrapper'
import busboy from 'busboy'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { FormDataContext } from '../types'
import { InvalidRequestError, PayloadTooLargeError } from './errors'

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
}

export function multipartParserWrapper<U, Ctx extends FormDataContext<U>, T extends IHttpServerComponent.IResponse>(
  handler: (ctx: Ctx) => Promise<T>,
  limits: MultipartLimits = {}
): (ctx: IHttpServerComponent.DefaultContext<U>) => Promise<T> {
  return async function (ctx: IHttpServerComponent.DefaultContext<U>): Promise<T> {
    const { maxTotalSize } = limits

    // Reject an upload whose declared Content-Length already exceeds the total budget, before we read
    // (and buffer) any of the body. A request that lies about or omits Content-Length is still bounded
    // by the cumulative `totalBytes` guard below, which stops once the buffered bytes exceed the cap.
    if (maxTotalSize !== undefined) {
      const declaredSize = parseInt(ctx.request.headers.get('content-length') || '', 10)
      if (!isNaN(declaredSize) && declaredSize > maxTotalSize) {
        throw new PayloadTooLargeError(
          `The request body is too large. The maximum allowed total upload size is ${maxTotalSize} bytes.`
        )
      }
    }

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
    const rejectIfOverTotal = (): boolean => {
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

    formDataParser.on('file', function (name, stream, info) {
      const chunks: Buffer[] = []
      stream.on('data', function (data: Buffer) {
        if (aborted) {
          return
        }
        totalBytes += data.length
        if (rejectIfOverTotal()) {
          return
        }
        chunks.push(data)
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
        files[name] = Object.assign(Object.assign({}, info), { fieldname: name, value: Buffer.concat(chunks) })
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
    try {
      await pipeline(source, formDataParser)
    } catch (error) {
      // Our own size-limit rejections keep their 413 status. Any other failure means we couldn't
      // parse the request body (a malformed, truncated, or empty multipart body, or a mid-upload
      // disconnect) — that's a client error (400), not an internal 500.
      if (error instanceof PayloadTooLargeError) {
        throw error
      }
      throw new InvalidRequestError('Invalid multipart/form-data request')
    }

    const newContext = Object.assign(Object.create(ctx), { formData: { fields, files } })
    return handler(newContext as Ctx)
  }
}
