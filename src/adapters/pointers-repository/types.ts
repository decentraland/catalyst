import { DatabaseClient } from '../../adapters/database'

export interface IPointersRepository {
  getItemEntitiesIdsThatMatchCollectionUrnPrefix(db: DatabaseClient, collectionUrn: string): Promise<string[]>
  getThirdPartyCollectionItemsEntityIdsThatMatchUrnPrefix(db: DatabaseClient, collectionUrn: string): Promise<string[]>
}
