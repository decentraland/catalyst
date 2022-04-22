import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'

const CONTENT_FILE_HASHES_QUERY = SQL`SELECT DISTINCT content_hash FROM content_files;`
const ENTITY_FILE_HASHES_QUERY = SQL`SELECT DISTINCT entity_id FROM deployments;`

export async function* streamAllDistinctContentFileHashes(
  components: Pick<AppComponents, 'database'>
): AsyncIterable<string> {
  const { database } = components

  for await (const row of database.streamQuery<{ content_hash: string }>(CONTENT_FILE_HASHES_QUERY, {
    batchSize: 10000
  })) {
    yield row.content_hash
  }
}

export async function* streamAllDistinctEntityIds(components: Pick<AppComponents, 'database'>): AsyncIterable<string> {
  const { database } = components

  for await (const row of database.streamQuery<{ entity_id: string }>(ENTITY_FILE_HASHES_QUERY, {
    batchSize: 10000
  })) {
    yield row.entity_id
  }
}
