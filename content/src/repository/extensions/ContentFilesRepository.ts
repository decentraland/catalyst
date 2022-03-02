import { ContentFileHash, DeploymentContent, EntityContentItemReference, Timestamp } from 'dcl-catalyst-commons'
import { Database } from '../../repository/Database'
import { DeploymentId } from './DeploymentsRepository'

export class ContentFilesRepository {
  constructor(private readonly db: Database) {}

  async findContentHashesNotBeingUsedAnymore(lastGarbageCollection: Timestamp): Promise<ContentFileHash[]> {
    return this.db.map(
      `SELECT * FROM content_files
    WHERE content_files.content_hash NOT IN (
      SELECT content_hash FROM content_files
      JOIN deployments on content_files.deployment=deployments.id
      WHERE (deployments.overwritten_by IS NULL)
    )`,
      [lastGarbageCollection],
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
