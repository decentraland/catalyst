import { ContentItem } from '@dcl/catalyst-storage'
import { HandlerContextWithPath, NotFoundError } from '../../types'
import { findEntityByPointer, findThumbnailHash } from '../../logic/entities'
import { createContentFileHeaders } from '../utils'

// Method: GET or HEAD
export async function getEntityThumbnailHandler(
  context: HandlerContextWithPath<
    'database' | 'activeEntities' | 'storage',
    '/entities/active/entity/:pointer/thumbnail'
  >
) {
  const { activeEntities, database } = context.components
  const pointer: string = context.params.pointer
  const entity = await findEntityByPointer(database, activeEntities, pointer)
  if (!entity) {
    throw new NotFoundError('Entity not found.')
  }

  const hash = findThumbnailHash(entity)
  if (!hash) {
    throw new NotFoundError('Entity has no thumbnail.')
  }

  const content: ContentItem | undefined = await context.components.storage.retrieve(hash)
  if (!content) {
    throw new NotFoundError('Entity has no thumbnail.')
  }

  return {
    status: 200,
    headers: createContentFileHeaders(content, hash),
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
