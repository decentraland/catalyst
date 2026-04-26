import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'
import { SystemProperties, SystemProperty } from './types'

export function createSystemProperties(components: Pick<AppComponents, 'database'>): SystemProperties {
  const { database } = components

  async function getRaw(key: string): Promise<string | undefined> {
    const { rows } = await database.queryWithValues<{ value: string }>(
      SQL`SELECT value FROM system_properties WHERE key = ${key}`
    )
    return rows.length > 0 ? rows[0].value : undefined
  }

  async function setRaw(key: string, value: string): Promise<void> {
    await database.queryWithValues(
      SQL`INSERT INTO system_properties (key, value) VALUES (${key}, ${value})
          ON CONFLICT ON CONSTRAINT system_properties_pkey
          DO UPDATE SET value = ${value}`
    )
  }

  return {
    async get<T>(property: SystemProperty<T>): Promise<T | undefined> {
      const raw = await getRaw(property.key)
      return raw !== undefined ? property.fromString(raw) : undefined
    },
    async set<T>(property: SystemProperty<T>, value: T): Promise<void> {
      await setRaw(property.key, property.toString(value))
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
