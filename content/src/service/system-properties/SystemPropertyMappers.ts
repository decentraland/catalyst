export interface SystemPropertyMapper<PropertyType> {
  toString(value: PropertyType): string
  fromString(value: string): PropertyType
}

export class IntPropertyMapper implements SystemPropertyMapper<number> {
  toString(value: number): string {
    return `${value}`
  }
  fromString(value: string): number {
    return parseInt(value)
  }
}

export class StringPropertyMapper implements SystemPropertyMapper<string> {
  toString(value: string): string {
    return value
  }
  fromString(value: string): string {
    return value
  }
}

export class JSONPropertyMapper<T> implements SystemPropertyMapper<T> {
  toString(value: T): string {
    return JSON.stringify(value)
  }
  fromString(value: string): T {
    return JSON.parse(value)
  }
}
