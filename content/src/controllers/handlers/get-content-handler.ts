import { HandlerContextWithPath } from '../../types'
import { NotFoundError } from '../errors'
import { checkNotModified, createContentFileHeaders, observeContentBodySize, retrieveContentWithRange } from '../utils'

// Method: GET or HEAD
export async function getContentHandler(
  context: HandlerContextWithPath<'storage' | 'metrics' | 'logs', '/contents/:hashId'>
) {
  const shouldCalculateContentType = context.url.searchParams.has('includeMimeType')
  const hash = context.params.hashId

  const fileInfo = await context.components.storage.fileInfo(hash)
  if (!fileInfo) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  const notModified = checkNotModified(context.request, hash)
  if (notModified) return notModified

  const rangeHeader = context.request.headers.get('range')
  const result = await retrieveContentWithRange(context.components.storage, hash, rangeHeader, fileInfo)
  if (!result) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  if (result.status === 416) {
    return {
      status: 416,
      headers: result.rangeHeaders
    }
  }

  const { content, status } = result
  const calculatedHeaders = await createContentFileHeaders(content, hash)
  const headers = shouldCalculateContentType
    ? calculatedHeaders
    : { ...calculatedHeaders, 'Content-Type': 'application/octet-stream' }

  const body =
    context.request.method.toUpperCase() === 'GET'
      ? observeContentBodySize(await content.asRawStream(), content.size, hash, context.components)
      : undefined

  return {
    status,
    headers: {
      ...headers,
      ...result.rangeHeaders
    },
    body
  }
}
