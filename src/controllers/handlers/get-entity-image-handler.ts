import { HandlerContextWithPath } from '../../types'
import { NotFoundError } from '../errors'
import { findEntityByPointer, findImageHash } from '../../logic/entities'
import { checkNotModified, createContentFileHeaders, retrieveContentWithRange } from '../utils'

// Method: GET or HEAD
export async function getEntityImageHandler(
  context: HandlerContextWithPath<
    'activeEntities' | 'database' | 'storage' | 'denylist',
    '/entities/active/entity/:pointer/image'
  >
) {
  const { activeEntities, database, denylist } = context.components
  const pointer: string = context.params.pointer
  const entity = await findEntityByPointer(database, activeEntities, pointer)
  // Treat a denylisted entity as not found so its content (and its very existence) isn't exposed
  // through the image endpoint, mirroring the listing endpoints that already filter the denylist.
  if (!entity || denylist.isDenylisted(entity.id)) {
    throw new NotFoundError('Entity not found.')
  }

  const hash = findImageHash(entity)
  // Also guard against a specific content hash being denylisted independently of its entity.
  if (!hash || denylist.isDenylisted(hash)) {
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

  return {
    status,
    headers: {
      ...headers,
      ...result.rangeHeaders
    },
    body: context.request.method.toUpperCase() === 'GET' ? await content.asRawStream() : undefined
  }
}
