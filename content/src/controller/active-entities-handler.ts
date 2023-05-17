import { Entity } from '@dcl/schemas'
import { GetActiveEntities200Item } from '@dcl/catalyst-api-specs/lib/client/client.schemas'
import { HandlerContextWithPath, InvalidRequestError } from '../types'

// Method: POST
// Body: { ids: string[], pointers: string[]}
export async function getActiveEntities(
  context: HandlerContextWithPath<'database' | 'activeEntities' | 'denylist', '/entities/active'>
): Promise<{ status: 200; body: GetActiveEntities200Item[] }> {
  const { database, activeEntities, denylist } = context.components
  const body = await context.request.json()
  const ids: string[] = body.ids
  const pointers: string[] = body.pointers

  const idsPresent = ids?.length > 0
  const pointersPresent = pointers?.length > 0

  const bothPresent = idsPresent && pointersPresent
  const nonePresent = !idsPresent && !pointersPresent
  if (bothPresent || nonePresent) {
    throw new InvalidRequestError('ids or pointers must be present, but not both')
  }

  const entities: Entity[] = (
    ids && ids.length > 0
      ? await activeEntities.withIds(database, ids)
      : await activeEntities.withPointers(database, pointers)
  ).filter((result) => !denylist.isDenylisted(result.id))

  return {
    status: 200,
    body: entities
  }
}
