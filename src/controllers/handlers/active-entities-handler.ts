import { Entity } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'

// JSON Schema for the POST /entities/active body: exactly one of `ids` or `pointers`, each a
// non-empty array of strings capped at 1000 entries to bound the costly `ANY(...)` query on this
// public, unauthenticated endpoint (issue #1935). Enforced as route middleware via
// @dcl/schema-validator-component.
export const activeEntitiesBodySchema = {
  oneOf: [
    {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 1000 } },
      required: ['ids'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: { pointers: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 1000 } },
      required: ['pointers'],
      additionalProperties: false
    }
  ]
}

// Method: POST
// Body: { ids: string[] } | { pointers: string[] }  (validated by the schema-validator middleware)
export async function getActiveEntitiesHandler(
  context: HandlerContextWithPath<'database' | 'activeEntities' | 'denylist', '/entities/active'>
): Promise<{ status: 200; body: Entity[] }> {
  const { database, activeEntities, denylist } = context.components
  // The schema-validator middleware guarantees exactly one of `ids`/`pointers` (non-empty arrays).
  // It reads the body via `request.clone().json()`, so the original request body is still unread
  // here and this second `json()` call is safe.
  const body = (await context.request.json()) as { ids: string[] } | { pointers: string[] }

  // No Cache-Control here: this is a POST and shared caches don't cache POST responses, so the
  // header would be a no-op. The cache window is applied on the GET /entities/:type read path.
  const entities: Entity[] = (
    'ids' in body
      ? await activeEntities.withIds(database, body.ids)
      : await activeEntities.withPointers(database, body.pointers)
  ).filter((result) => !denylist.isDenylisted(result.id))

  return {
    status: 200,
    body: entities
  }
}
