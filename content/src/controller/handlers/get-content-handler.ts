import { ContentItem } from '@dcl/catalyst-storage'
import { HandlerContextWithPath, NotFoundError } from '../../types'
import { createContentFileHeaders, parseRangeHeader } from '../utils'

// Method: GET or HEAD
export async function getContentHandler(context: HandlerContextWithPath<'storage', '/contents/:hashId'>) {
  const shouldCalculateContentType = context.url.searchParams.has('includeMimeType')
  const hash = context.params.hashId

  const fullContent: ContentItem | undefined = await context.components.storage.retrieve(hash)
  if (!fullContent) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  const calculatedHeaders = await createContentFileHeaders(fullContent, hash)
  const totalSize = fullContent.size
  const rangeHeader = context.request.headers.get('range')
  const range = parseRangeHeader(rangeHeader, totalSize)

  if (range) {
    const rangedContent = await context.components.storage.retrieve(hash, range)
    if (!rangedContent) {
      throw new NotFoundError(`No content found with hash ${hash}`)
    }

    const headers = shouldCalculateContentType
      ? calculatedHeaders
      : { ...calculatedHeaders, 'Content-Type': 'application/octet-stream' }

    return {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
        'Content-Length': rangedContent.size!.toString()
      },
      body: context.request.method.toUpperCase() === 'GET' ? await rangedContent.asRawStream() : undefined
    }
  }

  return {
    status: 200,
    headers: shouldCalculateContentType
      ? calculatedHeaders
      : { ...calculatedHeaders, 'Content-Type': 'application/octet-stream' },
    body: context.request.method.toUpperCase() === 'GET' ? await fullContent.asRawStream() : undefined
  }
}
