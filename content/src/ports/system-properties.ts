import { getSystemProperty, setSystemProperty } from '../logic/database-queries/system-properties-queries'
import { AppComponents } from '../types'

export type SystemProperty<T> = {
  key: string
  toString(value: T): string
  fromString(value: string): T
}

export type SystemProperties = {
  get<T>(property: SystemProperty<T>): Promise<T | undefined>
  set<T>(property: SystemProperty<T>, value: T): Promise<void>
}

export function createSystemProperties(components: Pick<AppComponents, 'database'>): SystemProperties {
  return {
    async get<T>(property: SystemProperty<T>) {
      const value = await getSystemProperty(components, property.key)
      return value ? property.fromString(value) : undefined
    },
    async set<T>(property: SystemProperty<T>, value: T) {
      await setSystemProperty(components, property.key, property.toString(value))
    }
  }
}

export const SYSTEM_PROPERTIES = {
  lastGarbageCollectionTime: {
    key: 'last_garbage_collection_time',
    toString(value: number) {
      return `${value}`
    },
    fromString(value: string) {
      return parseInt(value)
    }
  }
}
