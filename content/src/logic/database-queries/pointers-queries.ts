import SQL from 'sql-template-strings'
import { DatabaseClient } from '../../ports/postgres'

export async function getItemEntitiesIdsThatMatchCollectionUrnPrefix(
  database: DatabaseClient,
  collectionUrn: string
): Promise<string[]> {
  // sql-template-strings don't allow ' in the query string
  const matchingString = `${collectionUrn}%`
  const query = SQL`SELECT entity_id FROM active_pointers as p WHERE p.pointer LIKE ${matchingString};`

  const queryResult = (await database.queryWithValues<{ entity_id: string }>(query, 'filter_by_urn_prefix')).rows
  const entityIds = queryResult.map((row) => row.entity_id)

  return entityIds
}

export async function getThirdPartyCollectionItemsEntityIdsThatMatchCollectionUrnPrefix(
  database: DatabaseClient,
  collectionUrn: string
): Promise<string[]> {
  const matchingString = `${collectionUrn}%`
  const query = SQL`SELECT entity_id FROM active_third_party_collection_items_deployments_with_content as WHERE pointer LIKE ${matchingString};`
  const queryResult = (
    await database.queryWithValues<{ entity_id: string }>(query, 'filter_third_party_collection_items_by_urn_prefix')
  ).rows
  const entityIds = queryResult.map((row) => row.entity_id)

  return entityIds
}

export async function updateActiveDeployments(
  database: DatabaseClient,
  pointers: string[],
  entityId: string
): Promise<void> {
  const value_list = pointers.map((p, i) => {
    if (i < pointers.length - 1) {
      return SQL`(${p}, ${entityId}),`
    } else {
      return SQL`(${p}, ${entityId})`
    }
  })
  // sql-template-strings accepts only values on templates, to use structs you need to append queries
  const query = SQL`INSERT INTO active_pointers(pointer, entity_id) VALUES `
  value_list.forEach((v) => query.append(v))
  query.append(SQL` ON CONFLICT(pointer) DO UPDATE SET entity_id = ${entityId};`)

  await database.queryWithValues(query)
}

export async function removeActiveDeployments(database: DatabaseClient, pointers: string[]): Promise<void> {
  const value_list = pointers.map((p, i) => {
    if (i < pointers.length - 1) {
      return SQL`${p},`
    } else {
      return SQL`${p}`
    }
  })
  const query = SQL`DELETE FROM active_pointers WHERE pointer IN (`
  value_list.forEach((v) => query.append(v))
  query.append(`);`)

  await database.queryWithValues(query)
}
