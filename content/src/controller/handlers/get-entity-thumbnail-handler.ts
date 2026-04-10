import { HandlerContextWithPath, NotFoundError } from '../../types'
import { findEntityByPointer, findThumbnailHash } from '../../logic/entities'
import { createContentFileHeaders, retrieveContentWithRange } from '../utils'

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

  const rangeHeader = context.request.headers.get('range')
  const result = await retrieveContentWithRange(context.components.storage, hash, rangeHeader)
  if (!result) {
    throw new NotFoundError('Entity has no thumbnail.')
  }

  if (result.status === 416) {
    return {
      status: 416,
      headers: result.rangeHeaders
    }
  }

  const { content, status } = result
  const headers = await createContentFileHeaders(content, hash)

  return {
    status,
    headers: {
      ...headers,
      ...result.rangeHeaders
    },
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
