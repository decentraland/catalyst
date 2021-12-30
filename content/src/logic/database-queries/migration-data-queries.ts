import SQL from 'sql-template-strings'
import { DeploymentId } from 'src/repository/extensions/DeploymentsRepository'
import { AppComponents } from 'src/types'

interface MigrationDataRow {
  deployment: number
  original_metadata: any
}

export async function getMigrationData(
  components: Pick<AppComponents, 'database'>,
  deploymentIds: DeploymentId[]
): Promise<Map<DeploymentId, any>> {
  if (deploymentIds.length === 0) {
    return new Map()
  }
  const queryResult = (
    await components.database.queryWithValues(
      SQL`SELECT deployment, original_metadata FROM migration_data WHERE deployment = ANY (${deploymentIds})`
    )
  ).rows

  return new Map(queryResult.map((row: MigrationDataRow) => [row.deployment, row.original_metadata]))
}
