import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'

export async function filterContentFileHashes(
  components: Pick<AppComponents, 'database'>,
  hashes: string[]
): Promise<string[]> {
  const hashesList = hashes.map((p, i) => (i < hashes.length - 1 ? SQL`${p},` : SQL`${p}`))
  const query = SQL`SELECT distinct(content_hash) FROM content_files WHERE content_hash IN (`
  hashesList.forEach((v) => query.append(v))
  query.append(`);`)
  const queryResultRows = (await components.database.queryWithValues<{ content_hash: string }>(query, 'used_hashes'))
    .rows
  return queryResultRows.map((row) => row.content_hash)
}
