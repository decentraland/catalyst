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
