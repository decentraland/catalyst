import { Entity } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath, InvalidRequestError } from '../../types'
import Joi from 'joi'

const schema = Joi.alternatives().try(
  Joi.object({
    pointers: Joi.array().items(Joi.string()).min(1).required()
  })
)

// Method: POST
// Body: { pointers: string[]}
export async function getActiveEntitiesIdsHandler(
  context: HandlerContextWithPath<'database' | 'activeEntities' | 'denylist', '/entities/active'>
): Promise<{ status: 200; body: Pick<Entity, 'id' | 'pointers'>[] }> {
  const { database, activeEntities, denylist } = context.components
  const { error, value: body } = schema.validate(await context.request.json())

  if (error) {
    throw new InvalidRequestError(
      'pointers must be present. They must be arrays and contain at least one element. None of the elements can be empty.'
    )
  }

  const entities: Pick<Entity, 'id' | 'pointers'>[] = (await activeEntities.withPointers(database, body.pointers))
    .filter((result) => !denylist.isDenylisted(result.id))
    .map((entity) => {
      return {
        id: entity.id,
        pointers: entity.pointers
      }
    })

  return {
    status: 200,
    body: entities
  }
}
