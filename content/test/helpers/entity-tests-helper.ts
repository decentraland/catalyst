import { EntityContentItemReference } from '@dcl/hashing'
import { Entity, EntityType } from '@dcl/schemas'
import * as deploymentBuilder from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import { random } from 'faker'

function isString(value: any): boolean {
  return typeof value === 'string' || value instanceof String
}

function isPointerArray<T>(array: T[]): boolean {
  return array.every(isString)
}

function parseContent(contents: any[]): EntityContentItemReference[] | undefined {
  if (contents.length === 0) return
  return contents.map(({ file, hash }) => {
    if (!file || !hash) {
      throw new Error('Content must contain a file name and a file hash')
    }

    if (!isString(file) || !isString(hash)) {
      throw new Error('Please make sure that all file names and a file hashes are valid strings')
    }

    return { file, hash }
  })
}

function fromObject(object: any, id: string): Entity {
  if (!object.type || !Object.values(EntityType).includes(object.type)) {
    throw new Error(`Please set a valid type. It must be one of ${Object.values(EntityType)}. We got '${object.type}'`)
  }
  if (!object.pointers || !Array.isArray(object.pointers) || !isPointerArray(object.pointers)) {
    throw new Error(`Please set valid pointers`)
  }
  if (!object.timestamp || typeof object.timestamp != 'number') {
    throw new Error(`Please set a valid timestamp. We got ${object.timestamp}`)
  }

  let content: EntityContentItemReference[] = []
  if (object.content) {
    if (!Array.isArray(object.content)) {
      throw new Error(`Expected an array as content`)
    }
    content = parseContent(object.content) || []
  }

  const type: EntityType = EntityType[object.type.toUpperCase().trim()]
  return {
    id,
    type,
    pointers: object.pointers.map((pointer: string) => pointer.toLowerCase()),
    timestamp: object.timestamp,
    version: object.version ?? 'v3',
    content,
    metadata: object.metadata
  }
}

function fromJsonObject(object: any): Entity {
  if (!object.id) {
    throw new Error(`Expected to find a defined id`)
  }
  return fromObject(object, object.id)
}

/** Builds an entity with the given params, and also the file what represents it */
export async function buildEntityAndFile(
  type: EntityType,
  pointers: string[],
  timestamp: number,
  content?: Map<string, string>,
  metadata?: any
): Promise<[Entity, Uint8Array]> {
  const newContent = Array.from((content ?? new Map()).entries()).map(([file, hash]) => ({ file, hash }))
  const { entity, entityFile } = await deploymentBuilder.buildEntityAndFile({
    type,
    pointers,
    timestamp,
    content: newContent,
    metadata
  })
  return [fromJsonObject(entity), entityFile]
}

/** Build a file with the given entity as the content */
export function entityToFile(entity: Entity): Buffer {
  const copy: any = Object.assign({}, entity)
  copy.content =
    !copy.content || !(copy.content instanceof Map)
      ? copy.content
      : (Array.from(copy.content.entries()) as any).map(([key, value]) => ({ file: key, hash: value }))
  delete copy.id
  return Buffer.from(JSON.stringify(copy))
}

export function randomEntity(type?: EntityType): Entity {
  return {
    version: 'v3',
    id: random.alphaNumeric(10),
    type: type ?? EntityType.PROFILE,
    pointers: [random.alphaNumeric(1)],
    timestamp: random.number(10),
    metadata: random.alphaNumeric(10),
    content: []
  }
}
