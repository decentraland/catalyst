import { EntityContentItemReference } from '@dcl/hashing'
import { Entity, EntityType } from '@dcl/schemas'
import { HandlerContextWithPath, parseEntityType } from '../../types'

export enum EntityField {
  CONTENT = 'content',
  POINTERS = 'pointers',
  METADATA = 'metadata'
}

// Bound the request-controlled `id`/`pointer` arrays that feed the `ANY(...)`/overlap query, matching
// the cap on POST /entities/active (issue #1935). This public, unauthenticated endpoint would
// otherwise let one request push an unbounded number of values into the query.
const MAX_IDS_OR_POINTERS = 1000

/**
 * @deprecated
 * this endpoint will be deprecated in favor of `getActiveEntities`
 */
// Method: GET
// Query String: ?{filter}&fields={fieldList}
export async function getEntitiesHandler(
  context: HandlerContextWithPath<'activeEntities' | 'database' | 'queryParams' | 'denylist', '/entities/:type'>
) {
  const { database, activeEntities, queryParams, denylist } = context.components
  const type: EntityType = parseEntityType(context.params.type)
  const parsedParams = queryParams.qsParser(context.url.searchParams)

  const pointers: string[] = queryParams
    .qsGetArray(parsedParams, 'pointer')
    .map((pointer) => pointer.toLocaleLowerCase())
  const ids: string[] = queryParams.qsGetArray(parsedParams, 'id')
  const fields: string = parsedParams.fields as string

  // Validate type is valid
  if (!type) {
    return {
      status: 400,
      body: { error: `Unrecognized type: ${context.params.type}` }
    }
  }

  // Validate pointers or ids are present, but not both
  if ((ids.length > 0 && pointers.length > 0) || (ids.length == 0 && pointers.length == 0)) {
    return {
      status: 400,
      body: { error: 'ids or pointers must be present, but not both' }
    }
  }

  if (ids.length > MAX_IDS_OR_POINTERS || pointers.length > MAX_IDS_OR_POINTERS) {
    return {
      status: 400,
      body: { error: `Too many ids or pointers; the maximum allowed is ${MAX_IDS_OR_POINTERS}` }
    }
  }

  // Validate fields are correct or empty
  let enumFields: EntityField[] | undefined = undefined
  if (fields) {
    enumFields = fields.split(',').map((f) => (<any>EntityField)[f.toUpperCase().trim()])
  }

  // Calculate and mask entities (dropping any denylisted entity, as the sibling listing endpoints do)
  const entities: Entity[] = (
    !!ids.length ? await activeEntities.withIds(database, ids) : await activeEntities.withPointers(database, pointers)
  ).filter((entity) => !denylist.isDenylisted(entity.id))

  const maskedEntities: Entity[] = entities.map((entity) => maskEntity(entity, enumFields))
  return {
    status: 200,
    body: maskedEntities
  }
}

function maskEntity(fullEntity: Entity, fields?: EntityField[]): Entity {
  const { id, type, timestamp, version } = fullEntity
  let content: EntityContentItemReference[] = []
  let metadata: any
  let pointers: string[] = []
  if ((!fields || fields.includes(EntityField.CONTENT)) && fullEntity.content) {
    content = fullEntity.content
  }
  if (!fields || fields.includes(EntityField.METADATA)) {
    metadata = fullEntity.metadata
  }
  if ((!fields || fields.includes(EntityField.POINTERS)) && fullEntity.pointers) {
    pointers = fullEntity.pointers
  }
  return { version, id, type, timestamp, pointers, content, metadata }
}
