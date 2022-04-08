import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'

export async function filterContentFileHashes(
  components: Pick<AppComponents, 'database'>,
  hashes: string[]
): Promise<string[]> {
  if (hashes.length === 0) {
    return []
  }

  const joinedHashes = hashes.join(',')
  const query = SQL`SELECT distinct(content_hash) FROM content_files WHERE content_hash IN (${joinedHashes});`

  const queryResultRows = (await components.database.queryWithValues<{ content_hash: string }>(query, 'used_hashes'))
    .rows
  return queryResultRows.map((row) => row.content_hash)
}
