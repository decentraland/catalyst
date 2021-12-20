import SQL from 'sql-template-strings'
import { AppComponents } from '../types'

export async function deploymentExists(components: Pick<AppComponents, 'database'>, entityId: string) {
  const { database } = components

  const result = await database.queryWithValues(SQL`
    SELECT 1
    FROM deployments
    WHERE entity_id = ${entityId}
  `)

  return result.rowCount > 0
}

export async function* streamAllEntityIds(components: Pick<AppComponents, 'database'>) {
  const { database } = components

  for await (const row of database.streamQuery(
    SQL`
      SELECT entity_id FROM deployments
    `,
    { batchSize: 1000 }
  )) {
    yield {
      entityId: row.entity_id
    }
  }
}
