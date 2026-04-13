import { ContentItem, IContentStorageComponent } from '@dcl/catalyst-storage'
import { InvalidRequestError, Pagination } from '../types'
import { FileTypeParser } from 'file-type'
import { Readable } from 'stream'

export function paginationObject(url: URL, maxPageSize: number = 1000): Pagination {
  const pageSize = url.searchParams.has('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 100
  const pageNum = url.searchParams.has('pageNum') ? parseInt(url.searchParams.get('pageNum')!, 10) : 1

  if (pageSize > maxPageSize) {
    throw new InvalidRequestError(`max allowed pageSize is ${maxPageSize}`)
  }

  if (pageNum === 0) {
    throw new InvalidRequestError(`pageNum starts from 1`)
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
  if (!rangeHeader || totalSize === null) {
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

const NOT_MODIFIED_CACHE_CONTROL = 'public,max-age=31536000,s-maxage=31536000,immutable'

export function checkNotModified(
  request: { headers: { get(name: string): string | null } },
  hash: string
): { status: 304; headers: Record<string, string> } | undefined {
  const etag = JSON.stringify(hash)
  const ifNoneMatch = request.headers.get('if-none-match')
  if (!ifNoneMatch) return undefined

  if (ifNoneMatch === '*') {
    return { status: 304, headers: { ETag: etag, 'Cache-Control': NOT_MODIFIED_CACHE_CONTROL } }
  }

  // RFC 9110 §13.1.2: weak comparison — strip W/ prefix for matching
  const tags = ifNoneMatch.split(',').map((t) => t.trim().replace(/^W\//, ''))
  const compareEtag = etag.replace(/^W\//, '')
  if (tags.includes(compareEtag)) {
    return { status: 304, headers: { ETag: etag, 'Cache-Control': NOT_MODIFIED_CACHE_CONTROL } }
  }
}

export async function createContentFileHeaders(content: ContentItem, hashId: string): Promise<Record<string, string>> {
  const stream: Readable = await content.asRawStream()
  const fileTypeParser = new FileTypeParser()
  try {
    const mime = await fileTypeParser.fromStream(stream)
    const mimeType = mime?.mime || 'application/octet-stream'
    stream.destroy()

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      ETag: JSON.stringify(hashId), // by spec, the ETag must be a double-quoted string
      'Access-Control-Expose-Headers': 'ETag, Content-Range, Accept-Ranges, Content-Length',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public,max-age=31536000,s-maxage=31536000,immutable'
    }
    if (content.encoding) {
      headers['Content-Encoding'] = content.encoding
    }
    if (content.size) {
      headers['Content-Length'] = content.size.toString()
    }
    return headers
  } catch (error) {
    stream.destroy()
    throw error
  }
}

export async function retrieveContentWithRange(
  storage: IContentStorageComponent,
  hash: string,
  rangeHeader: string | null
): Promise<
  | { content: ContentItem; status: 200; rangeHeaders?: undefined }
  | { content: ContentItem; status: 206; rangeHeaders: Record<string, string> }
  | { content?: undefined; status: 416; rangeHeaders: Record<string, string> }
  | undefined
> {
  const fileInfo = await storage.fileInfo(hash)
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
