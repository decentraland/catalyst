import { ContentItem } from '@dcl/catalyst-storage'
import { HandlerContextWithPath, NotFoundError } from '../../types.js'
import { createContentFileHeaders } from '../utils.js'

// Method: GET or HEAD
export async function getContentHandler(context: HandlerContextWithPath<'storage', '/contents/:hashId'>) {
  const hash = context.params.hashId

  const content: ContentItem | undefined = await context.components.storage.retrieve(hash)
  if (!content) {
    throw new NotFoundError(`No content found with hash ${hash}`)
  }

  return {
    status: 200,
    headers: createContentFileHeaders(content, hash),
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
