import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'

const CONTENT_FILE_HASHES_QUERY = SQL`SELECT DISTINCT content_hash FROM content_files;`
const ENTITY_FILE_HASHES_QUERY = SQL`SELECT DISTINCT entity_id FROM deployments;`

export async function getContentFileHashes(components: Pick<AppComponents, 'database'>): Promise<string[]> {
  return (
    await components.database.queryWithValues<{ content_hash: string }>(CONTENT_FILE_HASHES_QUERY, 'used_hashes')
  ).rows.map((row) => row.content_hash)
}

export async function getEntityFileHashes(components: Pick<AppComponents, 'database'>): Promise<string[]> {
  return (
    await components.database.queryWithValues<{ entity_id: string }>(ENTITY_FILE_HASHES_QUERY, 'used_hashes')
  ).rows.map((row) => row.entity_id)
}
