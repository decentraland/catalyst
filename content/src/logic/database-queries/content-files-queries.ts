import SQL from 'sql-template-strings'
import { DeploymentContent } from '../../service/deployments/types'
import { AppComponents, DeploymentId } from '../../types'

export interface ContentFilesRow {
  deployment: number
  key: string
  content_hash: string
}

export async function getContentFiles(
  components: Pick<AppComponents, 'database' | 'metrics'>,
  deploymentIds: DeploymentId[]
): Promise<Map<DeploymentId, DeploymentContent[]>> {
  if (deploymentIds.length === 0) {
    return new Map()
  }

  const queryResult = (
    await components.database.queryWithValues(
      SQL`SELECT deployment, key, content_hash FROM content_files WHERE deployment = ANY (${deploymentIds})`,
      'get_content_files'
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

export async function findContentHashesNotBeingUsedAnymore(
  components: Pick<AppComponents, 'database'>,
  lastGarbageCollectionTimestamp: number
): Promise<string[]> {
  return (
    await components.database.queryWithValues<{ content_hash: string }>(
      SQL`
    SELECT content_files.content_hash
    FROM content_files
    INNER JOIN deployments ON content_files.deployment=id
    LEFT JOIN deployments AS dd ON deployments.deleter_deployment=dd.id
    WHERE dd.local_timestamp IS NULL OR dd.local_timestamp > to_timestamp(${lastGarbageCollectionTimestamp} / 1000.0)
    GROUP BY content_files.content_hash
    HAVING bool_or(deployments.deleter_deployment IS NULL) = FALSE
  `,
      'garbage_collection'
    )
  ).rows.map((row) => row.content_hash)
}
