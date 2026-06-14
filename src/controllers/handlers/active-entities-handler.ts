import { Entity } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'
import { EnvironmentConfig } from '../../Environment'

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
  context: HandlerContextWithPath<'database' | 'activeEntities' | 'denylist' | 'env', '/entities/active'>
): Promise<{ status: 200; headers?: Record<string, string>; body: Entity[] }> {
  const { database, activeEntities, denylist, env } = context.components
  // The schema-validator middleware guarantees exactly one of `ids`/`pointers` (non-empty arrays).
  // It reads the body via `request.clone().json()`, so the original request body is still unread
  // here and this second `json()` call is safe.
  const body = (await context.request.json()) as { ids: string[] } | { pointers: string[] }

  const entities: Entity[] = (
    'ids' in body
      ? await activeEntities.withIds(database, body.ids)
      : await activeEntities.withPointers(database, body.pointers)
  ).filter((result) => !denylist.isDenylisted(result.id))

  // Short, opt-in cache window so shared caches can absorb repeated identical reads. Default 10s,
  // tunable via ENTITIES_CACHE_CONTROL_MAX_AGE (set to 0 to disable). Active entities are mutable,
  // so this is a small staleness/perf tradeoff, not the immutable caching used for content blobs.
  const maxAge = env.getConfig<number>(EnvironmentConfig.ENTITIES_CACHE_CONTROL_MAX_AGE)
  return {
    status: 200,
    ...(maxAge && maxAge > 0 ? { headers: { 'Cache-Control': `public, max-age=${maxAge}` } } : {}),
    body: entities
  }
}
