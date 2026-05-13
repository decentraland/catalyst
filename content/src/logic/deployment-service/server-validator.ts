import { Entity } from '@dcl/schemas'
import ms from 'ms'
import { IFailedDeploymentsComponent } from '../../adapters/failed-deployments'
import { DeploymentContext } from '../../deployment-types'

const REQUEST_TTL_FORWARDS: number = ms('15m')

export interface ServiceCalls {
  areThereNewerEntities(entity: Entity): boolean | Promise<boolean>
  isEntityDeployedAlready(entity: Entity): boolean | Promise<boolean>
  isNotFailedDeployment(entity: Entity): boolean | Promise<boolean>
  isEntityRateLimited(entity: Entity): boolean | Promise<boolean>
  isRequestTtlBackwards(entity: Entity): boolean | Promise<boolean>
}

export const IGNORING_FIX_ERROR = 'Ignoring fix for failed deployment since there are newer entities. '

/**
 * Server-side validations for the entity currently being deployed, for the `LOCAL` and
 * `FIX_ATTEMPT` contexts. `SYNCED` / `SYNCED_LEGACY_ENTITY` contexts skip these checks.
 *
 * Module-level export so tests can `jest.spyOn(module, 'validateForServer')` to bypass
 * the server validations in integration tests that exercise other parts of the deploy path.
 */
export async function validateForServer(
  failedDeployments: IFailedDeploymentsComponent,
  entity: Entity,
  context: DeploymentContext,
  serviceCalls: ServiceCalls
): Promise<{ ok: true } | { ok: false; message: string }> {
  // SYNCED/SYNCED_LEGACY_ENTITY don't validate anything on this side.
  if (context === DeploymentContext.SYNCED || context === DeploymentContext.SYNCED_LEGACY_ENTITY) {
    return { ok: true }
  }

  if (context === DeploymentContext.LOCAL) {
    const error = await localChecks(entity, serviceCalls)
    if (error) {
      return { ok: false, message: error }
    }
  } else if (context === DeploymentContext.FIX_ATTEMPT) {
    // If there are newer entities, we can end up in a loop (unfixable failed deployment),
    // so we remove it from the failed deployments cache.
    if (await serviceCalls.areThereNewerEntities(entity)) {
      await failedDeployments.removeFailedDeployment(entity.id)
      return {
        ok: false,
        message: `${IGNORING_FIX_ERROR} (pointers=${entity.pointers.join(',')})`
      }
    }

    const error = await fixAttemptChecks(entity, serviceCalls)
    if (error) {
      return { ok: false, message: error }
    }
  }

  return { ok: true }
}

/** Checks when context is `DeploymentContext.LOCAL`. */
async function localChecks(entity: Entity, serviceCalls: ServiceCalls): Promise<string | undefined> {
  if (await serviceCalls.areThereNewerEntities(entity))
    return `There is a newer entity pointed by one or more of the pointers you provided (entityId=${
      entity.id
    } pointers=${entity.pointers.join(',')}).`

  if (await serviceCalls.isEntityDeployedAlready(entity))
    return `This entity was already deployed. You can't redeploy it`

  if (await serviceCalls.isEntityRateLimited(entity))
    return `Entity rate limited (entityId=${entity.id} pointers=${entity.pointers.join(',')}).`

  if (await serviceCalls.isRequestTtlBackwards(entity))
    return `The request is not recent enough, please submit it again with a new timestamp (entityId=${
      entity.id
    } pointers=${entity.pointers.join(',')}).`

  if (isRequestTtlForwards(entity))
    return `The request is too far in the future, please submit it again with a new timestamp (entityId=${
      entity.id
    } pointers=${entity.pointers.join(',')}).`
}

/** Checks when context is `DeploymentContext.FIX_ATTEMPT`. */
async function fixAttemptChecks(entity: Entity, serviceCalls: ServiceCalls): Promise<string | undefined> {
  if (await serviceCalls.isNotFailedDeployment(entity))
    return 'You are trying to fix an entity that is not marked as failed'
}

function isRequestTtlForwards(entity: Entity): boolean {
  return Date.now() - entity.timestamp < -REQUEST_TTL_FORWARDS
}
