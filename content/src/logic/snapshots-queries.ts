import { AuthChain } from 'dcl-crypto'
import SQL from 'sql-template-strings'
import { AppComponents } from '../types'

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

  const options = { batchSize: 10000 }

  for await (const row of database.streamQuery(
    SQL`
      SELECT
        entity_id,
        entity_type,
        entity_pointers,
        auth_chain,
        date_part('epoch', local_timestamp) * 1000 AS local_timestamp
      FROM deployments d
      WHERE d.deleter_deployment IS NULL
      ORDER BY d.local_timestamp ASC
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

export async function* streamActiveDeploymentsEntityType(
  components: Pick<AppComponents, 'database'>,
  entityType: string
): AsyncIterable<DeploymentWithAuthChain> {
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
      FROM deployments d
      WHERE d.deleter_deployment IS NULL AND d.entity_type = ${entityType}
      ORDER BY d.local_timestamp ASC
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
