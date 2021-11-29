import SQL from 'sql-template-strings'
import { AppComponents } from '../types'

// TODO memoize and bloom filter
export async function deploymentExists(components: Pick<AppComponents, 'database'>, entityId: string) {
  const { database } = components

  const result = await database.queryWithValues(SQL`
    SELECT 1
    FROM deployments
    WHERE entity_id = ${entityId}
  `)

  return result.rowCount > 0
}
