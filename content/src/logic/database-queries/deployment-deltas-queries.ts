import { EntityId, Pointer } from 'dcl-catalyst-commons'
import { AuthChain } from 'dcl-crypto'
import SQL from 'sql-template-strings'
import { DeploymentId } from '../../repository/extensions/DeploymentsRepository'
import { DELTA_POINTER_RESULT } from '../../service/pointers/PointerManager'
import { AppComponents } from '../../types'

export interface DeploymentDeltasRow {
  deployment: number
  pointer: string
  before?: string
  after: DELTA_POINTER_RESULT
  auth_chain: AuthChain
}

export async function getPointerChangesForDeployments(
  components: Pick<AppComponents, 'database'>,
  deploymentIds: DeploymentId[]
): Promise<
  Map<DeploymentId, Map<Pointer, { before?: EntityId; after: DELTA_POINTER_RESULT; authChain: AuthChain | null }>>
> {
  if (deploymentIds.length === 0) {
    return new Map()
  }

  const result: Map<
    DeploymentId,
    Map<Pointer, { before: EntityId | undefined; after: DELTA_POINTER_RESULT; authChain: AuthChain | null }>
  > = new Map()

  const deltas = (
    await components.database.queryWithValues(
      SQL`
            SELECT deployment, pointer, after, deployments.entity_id AS before, deployments.auth_chain AS auth_chain
            FROM deployment_deltas
            LEFT JOIN deployments on deployments.id = deployment_deltas.before
            WHERE deployment = ANY (${deploymentIds})`
    )
  ).rows

  deltas.forEach(({ deployment, pointer, before, after, auth_chain }: DeploymentDeltasRow) => {
    if (!result.has(deployment)) {
      result.set(deployment, new Map())
    }

    result.get(deployment)!.set(pointer, {
      before: before ?? undefined,
      after,
      authChain: auth_chain
    })
  })

  return result
}
