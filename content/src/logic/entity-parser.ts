import { EntityContentItemReference } from '@dcl/hashing'
import { Entity, EntityType } from '@dcl/schemas'
import { AnyObject } from '../types'

const textDecoder = new TextDecoder()

function getObjectEntityFromBuffer(buffer: Uint8Array): AnyObject {
  try {
    return JSON.parse(textDecoder.decode(buffer))
  } catch (e) {
    throw new Error(`Failed to parse the entity file. Please make sure that it is a valid json.`)
  }
}

function parseContent(contents: any[]): EntityContentItemReference[] | undefined {
  if (!contents || contents.length === 0) return

  return contents.map(({ file, hash }) => {
    if (!file || !hash) {
      throw new Error('Content must contain a file name and a file hash')
    }

    if (
      !(typeof file === 'string' || file instanceof String) ||
      !(typeof hash === 'string' || hash instanceof String)
    ) {
      throw new Error('Please make sure that all file names and a file hashes are valid strings')
    }

    return { file: file as string, hash: hash as string }
  })
}

function parseEntityFromObject(entityAsObject: AnyObject, id: string): Entity {
  return {
    id,
    type: EntityType[(entityAsObject.type as string).toUpperCase().trim()],
    pointers: (entityAsObject.pointers as string[]).map((pointer: string) => pointer.toLowerCase()),
    content: parseContent(entityAsObject.content as Array<any>) || [],
    version: (entityAsObject.version as string) ?? 'v3',
    timestamp: entityAsObject.timestamp as number,
    metadata: entityAsObject.metadata
  }
}

function validateObjectEntity(entityAsObject: AnyObject): void {
  const { type, pointers, timestamp, content } = entityAsObject

  if (!type || !(Object.values(EntityType) as string[]).includes(type as string))
    throw new Error(`Please set a valid type. It must be one of ${Object.values(EntityType)}. We got '${type}'`)

  if (
    !pointers ||
    !Array.isArray(pointers) ||
    !pointers.every((pointer) => typeof pointer === 'string' || pointer instanceof String)
  )
    throw new Error(`Please set valid pointers`)

  if (!timestamp || typeof timestamp !== 'number') throw new Error(`Please set a valid timestamp. We got ${timestamp}`)

  if (!!content && !Array.isArray(content)) throw new Error(`Expected an array as content`)
}

export function getEntityFromBuffer(buffer: Uint8Array, id: string): Entity {
  const entityAsObject = getObjectEntityFromBuffer(buffer)
  validateObjectEntity(entityAsObject)
  return parseEntityFromObject(entityAsObject, id)
}
