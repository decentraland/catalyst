import SQL from 'sql-template-strings'
import { DatabaseClient } from '../../adapters/database'
import { IPointersRepository } from './types'

// The URN prefix is caller-supplied. Escape the LIKE wildcards (`%`, `_`) and the escape character
// itself (`\`) so the prefix can only match literally and cannot be widened to match unrelated
// pointers (or force a full scan with a bare `%`). The pattern is bound as a query parameter, and
// PostgreSQL's LIKE uses backslash as its default escape character — so these backslash escapes are
// honored without an explicit `ESCAPE` clause.
//
// NOTE: do NOT write `ESCAPE '\'` in the SQL here: inside a JS template literal `\'` is the escape
// sequence for `'`, so it cooks to `ESCAPE ''`, which Postgres reads as "no escape character" —
// silently disabling all of the escaping below.
function toLikePrefixPattern(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, '\\$&')}%`
}

async function getItemEntitiesIdsThatMatchCollectionUrnPrefix(
  database: DatabaseClient,
  collectionUrn: string
): Promise<string[]> {
  const matchingString = toLikePrefixPattern(collectionUrn)
  const query = SQL`SELECT entity_id FROM active_pointers as p WHERE p.pointer LIKE ${matchingString};`

  const queryResult = (await database.queryWithValues<{ entity_id: string }>(query, 'filter_by_urn_prefix')).rows
  return queryResult.map((row) => row.entity_id)
}

async function getThirdPartyCollectionItemsEntityIdsThatMatchUrnPrefix(
  database: DatabaseClient,
  collectionUrn: string
): Promise<string[]> {
  const matchingString = toLikePrefixPattern(collectionUrn)
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
