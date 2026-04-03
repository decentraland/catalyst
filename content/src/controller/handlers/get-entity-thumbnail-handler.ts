import { ContentItem } from '@dcl/catalyst-storage'
import { HandlerContextWithPath, NotFoundError } from '../../types'
import { findEntityByPointer, findThumbnailHash } from '../../logic/entities'
import { createContentFileHeaders, parseRangeHeader } from '../utils'

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

  const fullContent: ContentItem | undefined = await context.components.storage.retrieve(hash)
  if (!fullContent) {
    throw new NotFoundError('Entity has no thumbnail.')
  }

  const headers = await createContentFileHeaders(fullContent, hash)
  const totalSize = fullContent.size
  const rangeHeader = context.request.headers.get('range')
  const range = parseRangeHeader(rangeHeader, totalSize)

  if (range) {
    const rangedContent = await context.components.storage.retrieve(hash, range)
    if (!rangedContent) {
      throw new NotFoundError('Entity has no thumbnail.')
    }

    return {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`,
        'Content-Length': rangedContent.size!.toString()
      },
      body: context.request.method.toUpperCase() === 'GET' ? await rangedContent.asRawStream() : undefined
    }
  }

  return {
    status: 200,
    headers,
    body: context.request.method.toUpperCase() === 'GET' ? await fullContent.asRawStream() : undefined
  }
}
