import { InvalidRequestError, Pagination } from '../types'
import { EntityContentItemReference } from '@dcl/hashing'
import { Entity } from '@dcl/schemas'
import { EntityField } from './Controller'

export function paginationObject(url: URL, maxPageSize: number = 1000): Pagination {
  const pageSize = url.searchParams.has('pageSize') ? parseInt(url.searchParams.get('pageSize')!, 10) : 100
  const pageNum = url.searchParams.has('pageNum') ? parseInt(url.searchParams.get('pageNum')!, 10) : 1

  if (pageSize > maxPageSize) {
    throw new InvalidRequestError(`max allowed pageSize is ${maxPageSize}`)
  }

  if (pageNum === 0) {
    throw new InvalidRequestError(`pageNum starts from 1`)
  }

  const offset = (pageNum - 1) * pageSize
  const limit = pageSize
  return { pageSize, pageNum, offset, limit }
}

export function fromCamelCaseToSnakeCase(phrase: string): string {
  const withoutUpperCase: string = phrase.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  if (withoutUpperCase[0] === '_') {
    return withoutUpperCase.substring(1)
  }
  return withoutUpperCase
}

export function asEnumValue<T extends { [key: number]: string }>(
  enumType: T,
  stringToMap?: string
): T[keyof T] | undefined | 'unknown' {
  if (stringToMap) {
    const validEnumValues: Set<string> = new Set(Object.values(enumType))
    const match = validEnumValues.has(stringToMap)
    return match ? (stringToMap as T[keyof T]) : 'unknown'
  }
}

export function maskEntity(fullEntity: Entity, fields?: EntityField[]): Entity {
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
