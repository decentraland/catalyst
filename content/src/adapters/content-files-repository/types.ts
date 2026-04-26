import { DatabaseClient } from '../../ports/postgres'
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
  findContentHashesNotBeingUsedAnymore(db: DatabaseClient, lastGarbageCollectionTimestamp: number): Promise<string[]>
  streamAllDistinctContentFileHashes(db: DatabaseClient): AsyncIterable<string>
}
