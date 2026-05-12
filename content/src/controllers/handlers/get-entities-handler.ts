import { EntityContentItemReference } from '@dcl/hashing'
import { Entity, EntityType } from '@dcl/schemas'
import { HandlerContextWithPath, parseEntityType } from '../../types'

export enum EntityField {
  CONTENT = 'content',
  POINTERS = 'pointers',
  METADATA = 'metadata'
}

/**
 * @deprecated
 * this endpoint will be deprecated in favor of `getActiveEntities`
 */
// Method: GET
// Query String: ?{filter}&fields={fieldList}
export async function getEntitiesHandler(
  context: HandlerContextWithPath<'activeEntities' | 'database' | 'queryParams', '/entities/:type'>
) {
  const { database, activeEntities, queryParams } = context.components
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

  // Validate fields are correct or empty
  let enumFields: EntityField[] | undefined = undefined
  if (fields) {
    enumFields = fields.split(',').map((f) => (<any>EntityField)[f.toUpperCase().trim()])
  }

  // Calculate and mask entities
  const entities: Entity[] = !!ids.length
    ? await activeEntities.withIds(database, ids)
    : await activeEntities.withPointers(database, pointers)

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
