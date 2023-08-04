import { PointerChangesSyncDeployment } from '@dcl/schemas'
import { DatabaseClient } from 'src/ports/postgres'
import { PointerChangesOptions } from '../../deployment-types.js'
import { getHistoricalDeployments, HistoricalDeployment } from '../../logic/database-queries/deployments-queries.js'
import { AppComponents } from '../../types.js'
import { DeploymentPointerChanges } from './types.js'

const MAX_HISTORY_LIMIT = 500

export async function getPointerChanges(
  components: Pick<AppComponents, 'denylist' | 'metrics'>,
  database: DatabaseClient,
  options?: PointerChangesOptions
): Promise<DeploymentPointerChanges> {
  const curatedOffset = options?.offset && options?.offset >= 0 ? options?.offset : 0
  const curatedLimit =
    options?.limit && options?.limit > 0 && options?.limit <= MAX_HISTORY_LIMIT ? options?.limit : MAX_HISTORY_LIMIT
  let deploymentsWithExtra: HistoricalDeployment[] = await getHistoricalDeployments(
    database,
    curatedOffset,
    curatedLimit + 1,
    options?.filters,
    options?.sortBy,
    options?.lastId
  )

  deploymentsWithExtra = deploymentsWithExtra.filter((result) => !components.denylist.isDenylisted(result.entityId))
  const moreData: boolean = deploymentsWithExtra.length > curatedLimit
  const deployments: PointerChangesSyncDeployment[] = deploymentsWithExtra.slice(0, curatedLimit)

  return {
    pointerChanges: deployments,
    filters: {
      ...options?.filters
    },
    pagination: {
      offset: curatedOffset,
      limit: curatedLimit,
      moreData
    }
  }
}
