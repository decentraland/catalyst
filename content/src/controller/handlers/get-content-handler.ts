import { ContentItem } from '@dcl/catalyst-storage'
import { HandlerContextWithPath, NotFoundError } from '../../types'
import { createContentFileHeaders } from '../utils'

// Method: GET or HEAD
export async function getContentHandler(context: HandlerContextWithPath<'storage', '/contents/:hashId'>) {
  const shouldCalculateContentType = context.request.headers.get('Accept') === 'Any'
  const hash = context.params.hashId

  const content: ContentItem | undefined = await context.components.storage.retrieve(hash)
  if (!content) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  const calculatedHeaders = await createContentFileHeaders(content, hash)

  return {
    status: 200,
    headers: shouldCalculateContentType
      ? calculatedHeaders
      : { ...calculatedHeaders, 'Content-Type': 'application/octet-stream' },
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
