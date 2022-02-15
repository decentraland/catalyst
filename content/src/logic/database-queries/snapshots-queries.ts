import { AuthChain } from 'dcl-crypto'
import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'

export type DeploymentWithAuthChain = {
  entityId: string
  entityType: string
  pointers: string[]
  localTimestamp: number
  authChain: AuthChain
}

export async function* streamActiveDeployments(
  components: Pick<AppComponents, 'database'>
): AsyncIterable<DeploymentWithAuthChain> {
  const { database } = components

  const options = { batchSize: 1000 }

  for await (const row of database.streamQuery(
    // IT IS IMPORTANT THAT THIS QUERY NEVER CHANGES. ORDER IS NOT GUARANTEED
    SQL`
      SELECT
        entity_id,
        entity_type,
        entity_pointers,
        auth_chain,
        date_part('epoch', local_timestamp) * 1000 AS local_timestamp
      FROM deployments d
      WHERE d.overwritten_by IS NULL
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
