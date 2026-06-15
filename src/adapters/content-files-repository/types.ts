import { DatabaseClient } from '../../adapters/database'
import { DeploymentContent } from '../../deployment-types'
import { ContentMapping } from '@dcl/schemas'
import { DeploymentId } from '../../types'

export interface ContentFilesRow {
  deployment: number
  key: string
  content_hash: string
}

export interface IContentFilesRepository {
  getContentFiles(db: DatabaseClient, deploymentIds: DeploymentId[]): Promise<Map<DeploymentId, DeploymentContent[]>>
  saveContentFiles(db: DatabaseClient, deploymentId: DeploymentId, content: ContentMapping[]): Promise<void>
  streamContentHashesNotBeingUsedAnymore(
    db: DatabaseClient,
    lastGarbageCollectionTimestamp: number,
    options?: { batchSize?: number }
  ): AsyncIterable<string>
  streamAllDistinctContentFileHashes(db: DatabaseClient): AsyncIterable<string>
}
