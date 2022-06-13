import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'

export async function getSystemProperty(
  components: Pick<AppComponents, 'database'>,
  key: string
): Promise<string | undefined> {
  const rows = (
    await components.database.queryWithValues<{ value: string }>(
      SQL`SELECT value FROM system_properties WHERE key = ${key}`
    )
  ).rows
  return rows.length > 0 ? rows[0].value : undefined
}

export async function setSystemProperty(
  components: Pick<AppComponents, 'database'>,
  key: string,
  value: string
): Promise<void> {
  await components.database.queryWithValues(
    SQL`INSERT INTO system_properties (key, value) VALUES (${key}, ${value})
  ON CONFLICT ON CONSTRAINT system_properties_pkey
  DO UPDATE SET value = ${value}`
  )
}
