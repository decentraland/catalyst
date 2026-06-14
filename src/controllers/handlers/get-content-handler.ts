import { HandlerContextWithPath } from '../../types'
import { NotFoundError } from '../errors'
import { checkNotModified, createContentFileHeaders, retrieveContentWithRange } from '../utils'

// Method: GET or HEAD
export async function getContentHandler(context: HandlerContextWithPath<'storage', '/contents/:hashId'>) {
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
  // Only sniff the MIME type when the client asked for it; otherwise we'd open a second stream on
  // the content (an extra storage round-trip) just to discard the result for octet-stream.
  const headers = await createContentFileHeaders(content, hash, shouldCalculateContentType)

  return {
    status,
    headers: {
      ...headers,
      ...result.rangeHeaders
    },
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
