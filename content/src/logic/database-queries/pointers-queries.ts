import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'

export async function gerUrnsThatMatchCollectionUrnPrefix(
  components: Pick<AppComponents, 'database'>,
  collectionUrn: string
): Promise<string[]> {
  // sql-template-strings doesn't allow ' in the query string
  const matchingString = `${collectionUrn}%`
  const query = SQL`SELECT pointer FROM active_pointers as p WHERE p.pointer LIKE ${matchingString} ORDER BY pointer DESC;`

  const queryResult = (await components.database.queryWithValues<{ pointer: string }>(query, 'filter_by_urn_prefix'))
    .rows

  return queryResult.map((row) => row.pointer)
}

export async function updateActiveDeployments(
  components: Pick<AppComponents, 'database'>,
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

  await components.database.queryWithValues(query)
}

export async function removeActiveDeployments(
  components: Pick<AppComponents, 'database'>,
  pointers: string[]
): Promise<void> {
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

  await components.database.queryWithValues(query)
}
