import { EntityId, Pointer } from 'dcl-catalyst-commons'
import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'

export async function getActiveDeploymentsByUrnPrefix(
  components: Pick<AppComponents, 'database'>,
  urnPrefix: string
): Promise<{ pointer: Pointer; entityId: EntityId }[]> {
  const query = SQL`SELECT * FROM active_pointers as p
    WHERE p.pointer LIKE '${urnPrefix}%';`

  const queryResult = (await components.database.queryWithValues(query)).rows

  const entities = queryResult.map((deployment: { entity_id: EntityId; pointer: Pointer }) => {
    return {
      entityId: deployment.entity_id,
      pointer: deployment.pointer
    }
  })

  return entities
}

export async function updateActiveDeployments(
  components: Pick<AppComponents, 'database'>,
  pointers: Pointer[],
  entityId: EntityId
): Promise<void> {
  const value_list = pointers
    .filter((p) => !!p)
    .map((p, i) => {
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

  console.log(query.query)
  await components.database.queryWithValues(query)
}
