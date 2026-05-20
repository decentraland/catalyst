import { ContentItem, FileInfo, IContentStorageComponent } from '@dcl/catalyst-storage'
import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { metricsDeclaration } from '../metrics'
import { Pagination } from '../types'
import { InvalidRequestError } from './errors'
import { FileTypeParser } from 'file-type'
import { Readable, Transform } from 'stream'

export function paginationObject(url: URL, maxPageSize: number = 1000): Pagination {
  const pageSize = url.searchParams.has('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 100
  const pageNum = url.searchParams.has('pageNum') ? parseInt(url.searchParams.get('pageNum')!, 10) : 1

  if (isNaN(pageSize) || pageSize < 1) {
    throw new InvalidRequestError(`pageSize must be a positive integer`)
  }

  if (isNaN(pageNum) || pageNum < 1) {
    throw new InvalidRequestError(`pageNum must be a positive integer`)
  }

  if (pageSize > maxPageSize) {
    throw new InvalidRequestError(`max allowed pageSize is ${maxPageSize}`)
  }

  const offset = (pageNum - 1) * pageSize
  const limit = pageSize
  return { pageSize, pageNum, offset, limit }
}

export function fromCamelCaseToSnakeCase(phrase: string): string {
  const withoutUpperCase: string = phrase.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  if (withoutUpperCase[0] === '_') {
    return withoutUpperCase.substring(1)
  }
  return withoutUpperCase
}

export function asEnumValue<T extends { [key: number]: string }>(
  enumType: T,
  stringToMap?: string
): T[keyof T] | undefined | 'unknown' {
  if (stringToMap) {
    const validEnumValues: Set<string> = new Set(Object.values(enumType))
    const match = validEnumValues.has(stringToMap)
    return match ? (stringToMap as T[keyof T]) : 'unknown'
  }
}

export function parseRangeHeader(
  rangeHeader: string | null,
  totalSize: number | null
): { type: 'range'; start: number; end: number } | { type: 'unsatisfiable' } | undefined {
  if (!rangeHeader || totalSize == null) {
    return undefined
  }

  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/)
  if (match) {
    const start = parseInt(match[1], 10)
    const end = match[2] ? parseInt(match[2], 10) : totalSize - 1

    if (start > end || start >= totalSize) {
      return { type: 'unsatisfiable' }
    }

    return { type: 'range', start, end: Math.min(end, totalSize - 1) }
  }

  const suffixMatch = rangeHeader.match(/^bytes=-(\d+)$/)
  if (suffixMatch) {
    const suffixLength = parseInt(suffixMatch[1], 10)
    if (suffixLength === 0 || totalSize === 0) {
      return { type: 'unsatisfiable' }
    }
    const start = Math.max(0, totalSize - suffixLength)
    const end = totalSize - 1
    return { type: 'range', start, end }
  }

  return undefined
}

const IMMUTABLE_CACHE_CONTROL = 'public,max-age=31536000,s-maxage=31536000,immutable'

// RFC 7232: ETag must be a double-quoted string
export function toETag(hash: string): string {
  return `"${hash}"`
}

export function checkNotModified(
  request: { headers: { get(name: string): string | null } },
  hash: string
): { status: 304; headers: Record<string, string> } | undefined {
  const etag = toETag(hash)
  const ifNoneMatch = request.headers.get('if-none-match')
  if (!ifNoneMatch) return undefined

  const notModifiedHeaders = {
    ETag: etag,
    'Cache-Control': IMMUTABLE_CACHE_CONTROL,
    'Access-Control-Expose-Headers': 'ETag'
  }

  if (ifNoneMatch === '*') {
    return { status: 304, headers: notModifiedHeaders }
  }

  // RFC 9110 §13.1.2: weak comparison — strip W/ prefix on client-supplied tags
  const tags = ifNoneMatch.split(',').map((t) => t.trim().replace(/^W\//, ''))
  if (tags.includes(etag)) {
    return { status: 304, headers: notModifiedHeaders }
  }

  return undefined
}

export async function createContentFileHeaders(content: ContentItem, hash: string): Promise<Record<string, string>> {
  const stream: Readable = await content.asRawStream()
  const fileTypeParser = new FileTypeParser()
  try {
    const mime = await fileTypeParser.fromStream(stream)
    const mimeType = mime?.mime || 'application/octet-stream'
    stream.destroy()

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      ETag: toETag(hash),
      'Access-Control-Expose-Headers': 'ETag, Content-Range, Accept-Ranges, Content-Length',
      'Accept-Ranges': 'bytes',
      'Cache-Control': IMMUTABLE_CACHE_CONTROL
    }
    if (content.encoding) {
      headers['Content-Encoding'] = content.encoding
    }
    // Use null-check rather than truthiness so a legitimate 0-byte file emits
    // `Content-Length: 0` instead of being elided. A missing Content-Length
    // forces chunked transfer encoding, which is indistinguishable from an
    // empty-but-cleanly-terminated chunk stream at upstream caches — and that
    // ambiguity is exactly what lets a truncated origin pull get cached as
    // "valid 0-byte response" by aggressively-configured CDNs.
    if (content.size != null) {
      headers['Content-Length'] = content.size.toString()
    }
    return headers
  } catch (error) {
    stream.destroy()
    throw error
  }
}

/**
 * Wrap a content body stream in a passthrough that compares bytes-streamed
 * against the size declared by storage, and emits a metric + warn log when
 * the two disagree.
 *
 * Detects the failure mode we cannot observe today: a stream that begins
 * normally and then ends short of `content.size` bytes for any reason
 * (storage backend hiccup, file-type detection consuming bytes that don't
 * get re-read, an upstream proxy mangling chunked encoding). Without this,
 * an empty / truncated body looks identical to a successful response at the
 * HTTP layer, and aggressively-cached CDNs in front of the catalyst will
 * latch onto the broken response for the lifetime of their TTL.
 *
 * When `expectedSize` is null (size unknown — uncommon for stored objects,
 * happens for some range responses) we can't validate and return the source
 * stream unchanged. The metric only fires for cases where storage knows the
 * size and the served body diverges from it.
 *
 * Source-stream errors are forwarded to the wrapped stream so the HTTP
 * framework still tears the response down cleanly; the `error` label on the
 * metric lets ops distinguish stream-errored short responses from
 * cleanly-ended short responses (the latter is the more alarming case —
 * means the origin claimed to send N bytes and then ended at <N without
 * raising an error).
 */
export function observeContentBodySize(
  source: Readable,
  expectedSize: number | null,
  hash: string,
  components: {
    metrics: IMetricsComponent<keyof typeof metricsDeclaration>
    logs: ILoggerComponent
  }
): Readable {
  if (expectedSize === null) return source

  const logger = components.logs.getLogger('content-body-size-observer')
  let observed = 0
  let reported = false

  const report = (reason: 'truncated' | 'error', error?: unknown) => {
    if (reported) return
    reported = true
    components.metrics.increment('dcl_content_short_response_total', { reason })
    logger.warn('content response body size mismatch', {
      hash,
      expectedSize,
      observed,
      reason,
      ...(error instanceof Error ? { error: error.message } : {})
    } as any)
  }

  // Transform is preferable to attaching a 'data' listener directly: a data
  // listener can put the source into flowing mode prematurely, which races
  // with the HTTP framework's own consumer. Transform respects backpressure
  // and lets the framework drive the flow as it would for the raw source.
  const counter = new Transform({
    transform(chunk: Buffer | Uint8Array, _encoding, callback) {
      observed += chunk.length
      callback(null, chunk)
    },
    flush(callback) {
      if (observed !== expectedSize) {
        report('truncated')
      }
      callback()
    }
  })

  source.on('error', (err) => {
    report('error', err)
    counter.destroy(err)
  })
  source.pipe(counter)

  return counter
}

export async function retrieveContentWithRange(
  storage: IContentStorageComponent,
  hash: string,
  rangeHeader: string | null,
  preloadedFileInfo?: FileInfo
): Promise<
  | { content: ContentItem; status: 200; rangeHeaders?: undefined }
  | { content: ContentItem; status: 206; rangeHeaders: Record<string, string> }
  | { content?: undefined; status: 416; rangeHeaders: Record<string, string> }
  | undefined
> {
  const fileInfo = preloadedFileInfo ?? (await storage.fileInfo(hash))
  if (!fileInfo) {
    return undefined
  }

  const totalSize = fileInfo.contentSize ?? fileInfo.size
  const range = parseRangeHeader(rangeHeader, totalSize)

  if (range?.type === 'unsatisfiable') {
    return {
      status: 416,
      rangeHeaders: {
        'Content-Range': `bytes */${totalSize}`,
        'Access-Control-Expose-Headers': 'Content-Range'
      }
    }
  }

  if (range?.type === 'range') {
    try {
      const content = await storage.retrieve(hash, range)
      if (!content) {
        return undefined
      }
      const contentLength = content.size ?? range.end - range.start + 1
      return {
        content,
        status: 206,
        rangeHeaders: {
          'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
          'Content-Length': contentLength.toString()
        }
      }
    } catch (error) {
      if (error instanceof RangeError) {
        return {
          status: 416,
          rangeHeaders: {
            'Content-Range': `bytes */${totalSize}`,
            'Access-Control-Expose-Headers': 'Content-Range'
          }
        }
      }
      throw error
    }
  }

  const content = await storage.retrieve(hash)
  if (!content) {
    return undefined
  }
  return { content, status: 200 }
}
