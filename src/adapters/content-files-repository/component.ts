import { ContentMapping } from '@dcl/schemas'
import SQL from 'sql-template-strings'
import { DatabaseClient } from '../../adapters/database'
import { DeploymentContent } from '../../deployment-types'
import { DeploymentId } from '../../types'
import { ContentFilesRow, IContentFilesRepository } from './types'

const CONTENT_FILE_HASHES_QUERY = SQL`SELECT DISTINCT content_hash FROM content_files;`

async function getContentFiles(
  database: DatabaseClient,
  deploymentIds: DeploymentId[]
): Promise<Map<DeploymentId, DeploymentContent[]>> {
  if (deploymentIds.length === 0) {
    return new Map()
  }

  const queryResult = (
    await database.queryWithValues(
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

async function saveContentFiles(
  database: DatabaseClient,
  deploymentId: DeploymentId,
  content: ContentMapping[]
): Promise<void> {
  if (content.length === 0) {
    return
  }

  const query = SQL`INSERT INTO content_files (deployment, key, content_hash) VALUES `
  for (let i = 0; i < content.length; ++i) {
    const item = content[i]
    query.append(SQL` (${deploymentId}, ${item.file}, ${item.hash})`)
    if (i < content.length - 1) {
      query.append(SQL`, `)
    }
  }

  await database.queryWithValues(query)
}

async function* streamContentHashesNotBeingUsedAnymore(
  database: DatabaseClient,
  lastGarbageCollectionTimestamp: number,
  options?: { batchSize?: number }
): AsyncIterable<string> {
  const query = SQL`
    SELECT content_files.content_hash
    FROM content_files
    INNER JOIN deployments ON content_files.deployment=id
    LEFT JOIN deployments AS dd ON deployments.deleter_deployment=dd.id
    WHERE dd.local_timestamp IS NULL OR dd.local_timestamp > to_timestamp(${lastGarbageCollectionTimestamp} / 1000.0)
    GROUP BY content_files.content_hash
    HAVING bool_or(deployments.deleter_deployment IS NULL) = FALSE
  `
  // Stream the result so garbage collection never materializes every unused hash in memory at once.
  for await (const row of database.streamQuery<{ content_hash: string }>(
    query,
    { batchSize: options?.batchSize ?? 1000 },
    'garbage_collection'
  )) {
    yield row.content_hash
  }
}

async function* streamAllDistinctContentFileHashes(database: DatabaseClient): AsyncIterable<string> {
  for await (const row of database.streamQuery<{ content_hash: string }>(CONTENT_FILE_HASHES_QUERY, {
    batchSize: 10000
  })) {
    yield row.content_hash
  }
}

export function createContentFilesRepository(): IContentFilesRepository {
  return {
    getContentFiles,
    saveContentFiles,
    streamContentHashesNotBeingUsedAnymore,
    streamAllDistinctContentFileHashes
  }
}
