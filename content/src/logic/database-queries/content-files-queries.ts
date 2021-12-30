import { DeploymentContent } from 'dcl-catalyst-commons'
import SQL from 'sql-template-strings'
import { DeploymentId } from 'src/repository/extensions/DeploymentsRepository'
import { AppComponents } from 'src/types'

interface ContentFilesRow {
  deployment: number
  key: string
  content_hash: string
}

export async function getContentFiles(
  components: Pick<AppComponents, 'database'>,
  deploymentIds: DeploymentId[]
): Promise<Map<DeploymentId, DeploymentContent[]>> {
  if (deploymentIds.length === 0) {
    return new Map()
  }

  const queryResult = (
    await components.database.queryWithValues(
      SQL`SELECT deployment, key, content_hash FROM content_files WHERE deployment = ANY (${deploymentIds})`
    )
  ).rows

  const result: Map<DeploymentId, DeploymentContent[]> = new Map()
  queryResult.forEach((row: ContentFilesRow) => {
    if (!result.has(row.deployment)) {
      result.set(row.deployment, [])
    }
    result.get(row.deployment)?.push({ key: row.key, hash: row.content_hash })
  })

  return result
}
