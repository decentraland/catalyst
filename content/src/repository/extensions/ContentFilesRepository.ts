import { DeploymentContent, EntityContentItemReference } from 'dcl-catalyst-commons'
import { Database } from '../../repository/Database'
import { DeploymentId } from './DeploymentsRepository'

export class ContentFilesRepository {
  constructor(private readonly db: Database) {}

  findContentHashesNotBeingUsedAnymore(lastGarbageCollectionTimestamp: number): Promise<string[]> {
    return this.db.map(
      `
            SELECT content_files.content_hash
            FROM content_files
            INNER JOIN deployments ON content_files.deployment=id
            LEFT JOIN deployments AS dd ON deployments.deleter_deployment=dd.id
            WHERE dd.local_timestamp IS NULL OR dd.local_timestamp > to_timestamp($1 / 1000.0)
            GROUP BY content_files.content_hash
            HAVING bool_or(deployments.deleter_deployment IS NULL) = FALSE
            `,
      [lastGarbageCollectionTimestamp],
      (row) => row.content_hash
    )
  }

  async getContentFiles(deploymentIds: DeploymentId[]): Promise<Map<DeploymentId, DeploymentContent[]>> {
    if (deploymentIds.length === 0) {
      return new Map()
    }
    const queryResult = await this.db.any(
      'SELECT deployment, key, content_hash FROM content_files WHERE deployment IN ($1:list)',
      [deploymentIds]
    )
    const result: Map<DeploymentId, DeploymentContent[]> = new Map()
    queryResult.forEach((row) => {
      if (!result.has(row.deployment)) {
        result.set(row.deployment, [])
      }
      result.get(row.deployment)?.push({ key: row.key, hash: row.content_hash })
    })
    return result
  }

  async saveContentFiles(deploymentId: DeploymentId, content: EntityContentItemReference[]): Promise<void> {
    await this.db.txIf((transaction) => {
      const contentPromises = content.map((item) =>
        transaction.none('INSERT INTO content_files (deployment, key, content_hash) VALUES ($1, $2, $3)', [
          deploymentId,
          item.file,
          item.hash
        ])
      )
      return transaction.batch(contentPromises)
    })
  }
}
