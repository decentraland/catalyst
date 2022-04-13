import { getHistoricalDeployments, HistoricalDeployment } from '../../logic/database-queries/deployments-queries'
import { DeploymentWithAuthChain } from '../../logic/database-queries/snapshots-queries'
import { AppComponents } from '../../types'
import { PointerChangesOptions } from '../deployments/types'
import { DeploymentPointerChanges } from './types'

const MAX_HISTORY_LIMIT = 500

export async function getPointerChanges(
  components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>,
  options?: PointerChangesOptions
): Promise<DeploymentPointerChanges> {
  const curatedOffset = options?.offset && options?.offset >= 0 ? options?.offset : 0
  const curatedLimit =
    options?.limit && options?.limit > 0 && options?.limit <= MAX_HISTORY_LIMIT ? options?.limit : MAX_HISTORY_LIMIT
  let deploymentsWithExtra: HistoricalDeployment[] = await getHistoricalDeployments(
    components,
    curatedOffset,
    curatedLimit + 1,
    options?.filters,
    options?.sortBy,
    options?.lastId
  )

  deploymentsWithExtra = deploymentsWithExtra.filter((result) => !components.denylist.isDenylisted(result.entityId))
  const moreData: boolean = deploymentsWithExtra.length > curatedLimit
  const deployments: DeploymentWithAuthChain[] = deploymentsWithExtra.slice(0, curatedLimit)

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
