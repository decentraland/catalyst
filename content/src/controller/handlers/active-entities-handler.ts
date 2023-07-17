import { Entity } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath, InvalidRequestError } from '../../types'
import { JSONSchemaType } from 'ajv'
import { ajv } from '../../logic/ajv'

type Body = { ids: string[] } | { pointers: string[] }

const schema: JSONSchemaType<Body> = {
  oneOf: [
    {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1
        }
      },
      required: ['ids']
    },
    {
      type: 'object',
      properties: {
        pointers: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1
        }
      },
      required: ['pointers']
    }
  ],
  errorMessage: 'ids or pointers must be present, but not both'
}

const validateBody = ajv.compile(schema)

// Method: POST
// Body: { ids: string[], pointers: string[]}
export async function getActiveEntitiesHandler(
  context: HandlerContextWithPath<'database' | 'activeEntities' | 'denylist', '/entities/active'>
): Promise<{ status: 200; body: Entity[] }> {
  const { database, activeEntities, denylist } = context.components
  const body = await context.request.json()
  const valid = validateBody(body)
  if (!valid) {
    const error = validateBody.errors!.map((e) => e.message).join(', ')
    throw new InvalidRequestError(error)
  }

  const ids = (body as any).ids
  const pointers = (body as any).pointers

  const entities: Entity[] = (
    ids ? await activeEntities.withIds(database, ids) : await activeEntities.withPointers(database, pointers)
  ).filter((result) => !denylist.isDenylisted(result.id))

  return {
    status: 200,
    body: entities
  }
}
