import { DatabaseClient } from '../../ports/postgres'

export interface IPointersRepository {
  getItemEntitiesIdsThatMatchCollectionUrnPrefix(db: DatabaseClient, collectionUrn: string): Promise<string[]>
  getThirdPartyCollectionItemsEntityIdsThatMatchUrnPrefix(db: DatabaseClient, collectionUrn: string): Promise<string[]>
  updateActiveDeployments(db: DatabaseClient, pointers: string[], entityId: string): Promise<void>
  removeActiveDeployments(db: DatabaseClient, pointers: string[]): Promise<void>
}
