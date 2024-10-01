import { ContentItem } from '@dcl/catalyst-storage'
import { InvalidRequestError, Pagination } from '../types'
import { fromStream } from 'file-type'
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

export async function createContentFileHeaders(content: ContentItem, hashId: string): Promise<Record<string, string>> {
  const stream: Readable = await content.asRawStream()
  try {
    const mime = await fromStream(stream)
    const mimeType = mime?.mime || 'application/octet-stream'
    stream.destroy()

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      ETag: JSON.stringify(hashId), // by spec, the ETag must be a double-quoted string
      'Access-Control-Expose-Headers': 'ETag',
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
