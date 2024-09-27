import { ContentItem } from '@dcl/catalyst-storage'
import { InvalidRequestError, Pagination } from '../types'
import { fromBuffer } from 'file-type'
import { Readable, Transform } from 'stream'

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

function createMimeTypeDetectStream(maxChunkSize = 4100, detectionTimeoutMs = 1000) {
  let buffer: Buffer = Buffer.alloc(0)
  let detected = false
  let timeout: NodeJS.Timeout | null = null

  const clearTimeoutFn = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
  }

  const detectMimeType = (emit: (event: string, mimeType: string) => void, _ = false) => {
    timeout = setTimeout(() => {
      if (!detected) {
        emit('mime-detected', 'application/octet-stream')
      }
    }, detectionTimeoutMs)

    // if it is JSON structure, fall-back on application/json MIME-TYPE automatically
    const initialData = buffer.toString('utf-8', 0, 1)
    if (initialData === '{' || initialData === '[') {
      emit('mime-detected', 'application/json')
      clearTimeoutFn()
      return
    }

    fromBuffer(buffer.slice(0, maxChunkSize))
      .then((mime) => {
        const mimeType = mime?.mime || 'application/octet-stream'
        emit('mime-detected', mimeType)
        clearTimeoutFn()
      })
      .catch(() => {
        emit('mime-detected', 'application/octet-stream')
        clearTimeoutFn()
      })
  }

  return new Transform({
    transform(chunk, encoding, callback) {
      buffer = Buffer.concat([buffer, chunk])

      if (buffer.length >= maxChunkSize && !detected) {
        detected = true
        detectMimeType(this.emit.bind(this))
        this.push(buffer)
      }

      callback()
    },

    flush(callback) {
      if (!detected && buffer.length > 0) {
        detectMimeType(this.emit.bind(this), true)
      }
      callback()
    }
  })
}

export async function createContentFileHeaders(content: ContentItem, hashId: string): Promise<Record<string, string>> {
  const stream: Readable = await content.asRawStream()

  const mimeDetectStream = createMimeTypeDetectStream(4100, 1000) // 1-second timeout

  return new Promise((resolve, reject) => {
    mimeDetectStream.on('mime-detected', (mimeType: string) => {
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

      resolve(headers)
    })

    mimeDetectStream.on('error', (_) => {
      mimeDetectStream.emit('mime-detected', 'application/octet-stream')
    })

    // Pipe the raw content stream through the MIME detection stream
    stream.pipe(mimeDetectStream)
  })
}
