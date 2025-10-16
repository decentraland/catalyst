import { Entity } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath, InvalidRequestError } from '../../types'
import Joi from 'joi'

const schema = Joi.alternatives().try(
  Joi.object({
    ids: Joi.array().items(Joi.string()).min(1).required()
  }),
  Joi.object({
    pointers: Joi.array().items(Joi.string()).min(1).required()
  })
)

// Method: POST
// Body: { ids: string[], pointers: string[]}
export async function getActiveEntitiesHandler(
  context: HandlerContextWithPath<'database' | 'activeEntities' | 'denylist', '/entities/active'>
): Promise<{ status: 200; body: Entity[] }> {
  const { database, activeEntities, denylist } = context.components
  const { error, value: body } = schema.validate(await context.request.json())

  if (error) {
    throw new InvalidRequestError(
      'ids or pointers must be present, but not both. They must be arrays and contain at least one element. None of the elements can be empty.'
    )
  }

  const entities: Entity[] = (
    body.ids
      ? await activeEntities.withIds(database, body.ids)
      : await activeEntities.withPointers(database, body.pointers)
  ).filter((result) => !denylist.isDenylisted(result.id))

  return {
    status: 200,
    body: entities
  }
}

// Method: GET
export async function getActiveEntitiesScenesHandler(
  context: HandlerContextWithPath<'activeEntities' | 'denylist', '/entities/active/scenes'>
): Promise<{ status: 200; body: Pick<Entity, 'id' | 'pointers' | 'timestamp'>[] }> {
  const { activeEntities, denylist } = context.components
  const entities: Entity[] = activeEntities.getAllCachedScenes().filter((result) => !denylist.isDenylisted(result.id))
  const mapping = entities.map((entity) => ({
    id: entity.id,
    pointers: entity.pointers,
    timestamp: entity.timestamp
  }))
  return {
    status: 200,
    body: mapping
  }
}
