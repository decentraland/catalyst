import { Entity, EntityContentItemReference, EntityId, EntityType, EntityVersion, Pointer } from 'dcl-catalyst-commons'

export class EntityFactory {
  static fromBufferWithId(buffer: Uint8Array, id: EntityId): Entity {
    const object = EntityFactory.parseJsonIntoObject(buffer)
    return EntityFactory.fromObject(object, id)
  }

  static fromJsonObject(object: any): Entity {
    if (!object.id) {
      throw new Error(`Expected to find a defined id`)
    }
    return EntityFactory.fromObject(object, object.id)
  }

  private static parseJsonIntoObject(buffer: Uint8Array): any {
    try {
      return JSON.parse(new TextDecoder().decode(buffer))
    } catch (e) {
      throw new Error(`Failed to parse the entity file. Please make sure that it is a valid json.`)
    }
  }

  private static fromObject(object: any, id: EntityId): Entity {
    if (!object.type || !Object.values(EntityType).includes(object.type)) {
      throw new Error(
        `Please set a valid type. It must be one of ${Object.values(EntityType)}. We got '${object.type}'`
      )
    }
    if (!object.pointers || !Array.isArray(object.pointers) || !this.isPointerArray(object.pointers)) {
      throw new Error(`Please set valid pointers`)
    }
    if (!object.timestamp || typeof object.timestamp != 'number') {
      throw new Error(`Please set a valid timestamp. We got ${object.timestamp}`)
    }

    let content: EntityContentItemReference[] | undefined = undefined
    if (object.content) {
      if (!Array.isArray(object.content)) {
        throw new Error(`Expected an array as content`)
      }
      content = this.parseContent(object.content)
    }

    let version: EntityVersion
    if (!object.version || !Object.values(EntityVersion).includes(object.version)) {
      version = EntityVersion.V3
    } else {
      version = object.version
    }

    const type: EntityType = EntityType[object.type.toUpperCase().trim()]
    return {
      id,
      type,
      pointers: object.pointers.map((pointer: Pointer) => pointer.toLowerCase()),
      timestamp: object.timestamp,
      version,
      content,
      metadata: object.metadata
    }
  }

  private static parseContent(contents: any[]): EntityContentItemReference[] | undefined {
    if (contents.length === 0) return
    return contents.map(({ file, hash }) => {
      if (!file || !hash) {
        throw new Error('Content must contain a file name and a file hash')
      }

      if (!this.isString(file) || !this.isString(hash)) {
        throw new Error('Please make sure that all file names and a file hashes are valid strings')
      }

      return { file, hash }
    })
  }

  private static isPointerArray<T>(array: T[]): boolean {
    return array.every(this.isString)
  }

  private static isString(value: any): boolean {
    return typeof value === 'string' || value instanceof String
  }
}
