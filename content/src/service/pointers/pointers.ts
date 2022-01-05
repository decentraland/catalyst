import { EntityId, Pointer } from 'dcl-catalyst-commons'
import { getPointerChangesForDeployments } from '../../logic/deployment-deltas-queries'
import { getHistoricalDeployments } from '../../logic/deployments-queries'
import { AppComponents } from '../../types'
import { PointerChangesOptions } from '../deployments/types'
import { DELTA_POINTER_RESULT } from '../pointers/PointerManager'
import { DeploymentPointerChanges, PartialDeploymentPointerChanges, PointerChanges } from './types'

const MAX_HISTORY_LIMIT = 500

export async function getPointerChanges(
  components: Pick<AppComponents, 'database'>,
  options?: PointerChangesOptions
): Promise<PartialDeploymentPointerChanges> {
  const curatedOffset = options?.offset && options?.offset >= 0 ? options?.offset : 0
  const curatedLimit =
    options?.limit && options?.limit > 0 && options?.limit <= MAX_HISTORY_LIMIT ? options?.limit : MAX_HISTORY_LIMIT
  const deploymentsWithExtra = await getHistoricalDeployments(
    components,
    curatedOffset,
    curatedLimit + 1,
    options?.filters,
    options?.sortBy,
    options?.lastId
  )
  const moreData = deploymentsWithExtra.length > curatedLimit

  const deployments = deploymentsWithExtra.slice(0, curatedLimit)
  const deploymentIds = deployments.map(({ deploymentId }) => deploymentId)
  const deltasForDeployments = await getPointerChangesForDeployments(components, deploymentIds)
  const pointerChanges: DeploymentPointerChanges[] = deployments.map(
    ({ deploymentId, entityId, entityType, localTimestamp, authChain }) => {
      const delta = deltasForDeployments.get(deploymentId) ?? new Map()
      const changes = transformPointerChanges(entityId, delta)
      return { entityType, entityId, localTimestamp, changes, authChain }
    }
  )

  return {
    pointerChanges,
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

function transformPointerChanges(
  deployedEntity: EntityId,
  input: Map<Pointer, { before: EntityId | undefined; after: DELTA_POINTER_RESULT }>
): PointerChanges {
  const newEntries = Array.from(input.entries()).map<
    [Pointer, { before: EntityId | undefined; after: EntityId | undefined }]
  >(([pointer, { before, after }]) => [
    pointer,
    { before, after: after === DELTA_POINTER_RESULT.SET ? deployedEntity : undefined }
  ])
  return new Map(newEntries)
}
