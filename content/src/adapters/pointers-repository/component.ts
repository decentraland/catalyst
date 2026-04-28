import SQL from 'sql-template-strings'
import { DatabaseClient } from '../../ports/postgres'
import { IPointersRepository } from './types'

export async function getItemEntitiesIdsThatMatchCollectionUrnPrefix(
  database: DatabaseClient,
  collectionUrn: string
): Promise<string[]> {
  // sql-template-strings don't allow ' in the query string
  const matchingString = `${collectionUrn}%`
  const query = SQL`SELECT entity_id FROM active_pointers as p WHERE p.pointer LIKE ${matchingString};`

  const queryResult = (await database.queryWithValues<{ entity_id: string }>(query, 'filter_by_urn_prefix')).rows
  return queryResult.map((row) => row.entity_id)
}

export async function getThirdPartyCollectionItemsEntityIdsThatMatchUrnPrefix(
  database: DatabaseClient,
  collectionUrn: string
): Promise<string[]> {
  const matchingString = `${collectionUrn}%`
  const query = SQL`SELECT entity_id FROM active_third_party_collection_items_deployments_with_content WHERE pointer LIKE ${matchingString};`
  const queryResult = (
    await database.queryWithValues<{ entity_id: string }>(query, 'filter_third_party_collection_items_by_urn_prefix')
  ).rows
  return queryResult.map((row) => row.entity_id)
}

export function createPointersRepository(): IPointersRepository {
  return {
    getItemEntitiesIdsThatMatchCollectionUrnPrefix,
    getThirdPartyCollectionItemsEntityIdsThatMatchUrnPrefix
  }
}
