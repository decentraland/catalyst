import { IHttpServerComponent } from '@dcl/core-commons'
import { Field, File } from '@well-known-components/multipart-wrapper'
import busboy from 'busboy'
import { Readable } from 'stream'
import { FormDataContext } from '../types'
import { PayloadTooLargeError } from './errors'

/**
 * Limits applied to a multipart request before its contents are buffered into memory.
 *
 * The upstream `@well-known-components/multipart-wrapper` buffers every uploaded file
 * fully in memory (`Buffer.concat`) with no bound, and this happens *before* any
 * authentication/validation runs — so an unauthenticated client can exhaust memory by
 * streaming a large body. This wrapper is a drop-in replacement that wires `busboy`'s
 * native limits and rejects (HTTP 413) as soon as a limit is exceeded, instead of
 * silently buffering or truncating.
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
}

export function multipartParserWrapper<U, Ctx extends FormDataContext<U>, T extends IHttpServerComponent.IResponse>(
  handler: (ctx: Ctx) => Promise<T>,
  limits: MultipartLimits = {}
): (ctx: IHttpServerComponent.DefaultContext<U>) => Promise<T> {
  return async function (ctx: IHttpServerComponent.DefaultContext<U>): Promise<T> {
    const formDataParser = busboy({
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

    const fields: Record<string, Field> = {}
    const files: Record<string, File> = {}

    const finished = new Promise<void>((ok, err) => {
      formDataParser.on('error', err)
      formDataParser.on('finish', ok)
    })

    // Emitted once more files than `maxFiles` are seen. Reject instead of dropping them silently.
    formDataParser.on('filesLimit', function () {
      formDataParser.destroy(
        new PayloadTooLargeError(`Too many files in the request. The maximum allowed is ${limits.maxFiles}.`)
      )
    })

    // Emitted once more than `maxFields` non-file fields are seen. Bounds the in-memory `fields`
    // object and any downstream per-field work (e.g. the auth-chain index scan) so a request with a
    // huge number of fields can't exhaust memory/CPU.
    formDataParser.on('fieldsLimit', function () {
      formDataParser.destroy(
        new PayloadTooLargeError(`Too many form fields in the request. The maximum allowed is ${limits.maxFields}.`)
      )
    })

    formDataParser.on('field', function (name, value, info) {
      // busboy truncates a field value larger than `maxFieldSize` (setting valueTruncated); reject
      // rather than store a partial value.
      if (info.valueTruncated) {
        formDataParser.destroy(
          new PayloadTooLargeError(
            `Field '${name}' is too large. The maximum allowed size per field is ${limits.maxFieldSize} bytes.`
          )
        )
        return
      }
      fields[name] = Object.assign({ fieldname: name, value }, info)
    })

    formDataParser.on('file', function (name, stream, info) {
      const chunks: Buffer[] = []
      stream.on('data', function (data: Buffer) {
        chunks.push(data)
      })
      // Emitted when the file exceeds `maxFileSize`. busboy truncates the stream, so we
      // must reject rather than store partial (and therefore wrong-hash) content.
      stream.on('limit', function () {
        formDataParser.destroy(
          new PayloadTooLargeError(
            `File '${info.filename}' is too large. The maximum allowed size per file is ${limits.maxFileSize} bytes.`
          )
        )
      })
      stream.on('error', function (err: Error) {
        formDataParser.destroy(err)
      })
      stream.on('end', function () {
        files[name] = Object.assign(Object.assign({}, info), { fieldname: name, value: Buffer.concat(chunks) })
      })
    })

    // @dcl/http-server v2 hands handlers a native `Request`, whose `body` is a web `ReadableStream`
    // rather than a Node stream. Adapt it so it can be piped into busboy. The static type still
    // describes a node-fetch body (sourced from @well-known-components/interfaces), hence the cast.
    const requestBody = ctx.request.body as unknown as Parameters<typeof Readable.fromWeb>[0] | null
    if (requestBody) {
      Readable.fromWeb(requestBody).pipe(formDataParser)
    } else {
      formDataParser.end()
    }
    const newContext = Object.assign(Object.create(ctx), { formData: { fields, files } })
    await finished
    return handler(newContext as Ctx)
  }
}
