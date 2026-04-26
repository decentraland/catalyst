import { DatabaseClient } from '../../ports/postgres'

export interface IPointersRepository {
  getItemEntitiesIdsThatMatchCollectionUrnPrefix(db: DatabaseClient, collectionUrn: string): Promise<string[]>
  getThirdPartyCollectionItemsEntityIdsThatMatchUrnPrefix(db: DatabaseClient, collectionUrn: string): Promise<string[]>
}
