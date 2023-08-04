import { ContentItem } from '@dcl/catalyst-storage'
import { HandlerContextWithPath, NotFoundError } from '../../types.js'
import { findEntityByPointer, findImageHash } from '../../logic/entities.js'
import { createContentFileHeaders } from '../utils.js'

// Method: GET or HEAD
export async function getEntityImageHandler(
  context: HandlerContextWithPath<'activeEntities' | 'database' | 'storage', '/entities/active/entity/:pointer/image'>
) {
  const { activeEntities, database } = context.components
  const pointer: string = context.params.pointer
  const entity = await findEntityByPointer(database, activeEntities, pointer)
  if (!entity) {
    throw new NotFoundError('Entity not found.')
  }

  const hash = findImageHash(entity)
  if (!hash) {
    throw new NotFoundError('Entity has no image.')
  }

  const content: ContentItem | undefined = await context.components.storage.retrieve(hash)
  if (!content) {
    throw new NotFoundError('Entity has no image.')
  }

  return {
    status: 200,
    headers: createContentFileHeaders(content, hash),
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
