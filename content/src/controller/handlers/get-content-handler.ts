import { HandlerContextWithPath, NotFoundError } from '../../types'
import { createContentFileHeaders, retrieveContentWithRange } from '../utils'

// Method: GET or HEAD
export async function getContentHandler(context: HandlerContextWithPath<'storage', '/contents/:hashId'>) {
  const shouldCalculateContentType = context.url.searchParams.has('includeMimeType')
  const hash = context.params.hashId

  const rangeHeader = context.request.headers.get('range')
  const result = await retrieveContentWithRange(context.components.storage, hash, rangeHeader)
  if (!result) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  const { content, status } = result
  const calculatedHeaders = await createContentFileHeaders(content, hash)
  const headers = shouldCalculateContentType
    ? calculatedHeaders
    : { ...calculatedHeaders, 'Content-Type': 'application/octet-stream' }

  return {
    status,
    headers: {
      ...headers,
      ...result.rangeHeaders
    },
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
