import { HandlerContextWithPath, NotFoundError } from '../../types'
import { findEntityByPointer, findImageHash } from '../../logic/entities'
import { createContentFileHeaders, retrieveContentWithRange } from '../utils'

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

  const rangeHeader = context.request.headers.get('range')
  const result = await retrieveContentWithRange(context.components.storage, hash, rangeHeader)
  if (!result) {
    throw new NotFoundError('Entity has no image.')
  }

  if (result.status === 416) {
    return {
      status: 416,
      headers: result.rangeHeaders
    }
  }

  const { content, status } = result
  const headers = await createContentFileHeaders(content, hash)

  const ifNoneMatch = context.request.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch === headers['ETag']) {
    return { status: 304, headers }
  }

  return {
    status,
    headers: {
      ...headers,
      ...result.rangeHeaders
    },
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
