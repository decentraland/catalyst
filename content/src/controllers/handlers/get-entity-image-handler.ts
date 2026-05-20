import { HandlerContextWithPath } from '../../types'
import { NotFoundError } from '../errors'
import { findEntityByPointer, findImageHash } from '../../logic/entities'
import { checkNotModified, createContentFileHeaders, observeContentBodySize, retrieveContentWithRange } from '../utils'

// Method: GET or HEAD
export async function getEntityImageHandler(
  context: HandlerContextWithPath<
    'activeEntities' | 'database' | 'storage' | 'metrics' | 'logs',
    '/entities/active/entity/:pointer/image'
  >
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

  const notModified = checkNotModified(context.request, hash)
  if (notModified) return notModified

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
