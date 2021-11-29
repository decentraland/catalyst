import SQL from 'sql-template-strings'
import { AppComponents } from '../types'

export async function* streamCurrentDeployments(components: Pick<AppComponents, 'database'>) {
  const { database } = components

  const options = { batchSize: 10000 }

  for await (const row of database.streamQuery(
    SQL`
      SELECT
        entity_id,
        entity_type,
        entity_pointers,
        auth_chain,
        date_part('epoch', local_timestamp) * 1000 AS local_timestamp
      FROM deployments
      WHERE deleter_deployment IS NULL
      ORDER BY local_timestamp ASC
    `,
    options
  )) {
    yield {
      entityId: row.entity_id,
      entityType: row.entity_type,
      pointers: row.entity_pointers,
      localTimestamp: row.local_timestamp,
      authChain: row.auth_chain
    }
  }
}
