import { Entity } from 'dcl-catalyst-commons'
import ms from 'ms'
import { DeploymentContext } from '../Service'

type EntityCheck = (entity: Entity) => boolean | Promise<boolean>

export interface ServerValidator {
  validate(
    entity: Entity,
    context: DeploymentContext,
    serviceCalls: ServiceCalls
  ): Promise<{ ok: true } | { ok: false; message: string }>
}

interface ServiceCalls {
  areThereNewerEntities: EntityCheck
  isEntityDeployedAlready: EntityCheck
  isNotFailedDeployment: EntityCheck
  isEntityRateLimited: EntityCheck
  isRequestTtlBackwards: EntityCheck
}

const REQUEST_TTL_FORWARDS: number = ms('15m')
const isRequestTtlForwards: EntityCheck = async (entity) => Date.now() - entity.timestamp < -REQUEST_TTL_FORWARDS

/**
 * Checks when context is DeploymentContext.LOCAL
 */
const localChecks = (entity: Entity, serviceCalls: ServiceCalls) => [
  {
    check: serviceCalls.areThereNewerEntities,
    response: 'There is a newer entity pointed by one or more of the pointers you provided.'
  },
  {
    check: serviceCalls.isEntityDeployedAlready,
    response: `This entity was already deployed. You can't redeploy it`
  },
  {
    check: serviceCalls.isEntityRateLimited,
    response: `Entity rate limited (entityId=${entity.id} pointers=${entity.pointers.join(',')}).`
  },
  {
    check: serviceCalls.isRequestTtlBackwards,
    response: 'The request is not recent enough, please submit it again with a new timestamp.'
  },
  {
    check: isRequestTtlForwards,
    response: 'The request is too far in the future, please submit it again with a new timestamp.'
  }
]
/**
 * Checks when context is DeploymentContext.FIX_ATTEMPT
 */
const fixAttemptChecks = (serviceCalls: ServiceCalls) => [
  {
    check: serviceCalls.isNotFailedDeployment,
    response: 'You are trying to fix an entity that is not marked as failed'
  }
]
/**
 * Server side validations for current deploying entity for LOCAL and FIX_ATTEMPT contexts
 */
export const createServerValidator = (): ServerValidator => ({
  validate: async (entity, context, serviceCalls) => {
    let checks: { check: EntityCheck; response: string }[] = []

    // this contexts doesn't validate anything in this side
    if (context === DeploymentContext.SYNCED || context === DeploymentContext.SYNCED_LEGACY_ENTITY) return { ok: true }

    if (context === DeploymentContext.LOCAL) {
      checks = localChecks(entity, serviceCalls)
    } else if (context === DeploymentContext.FIX_ATTEMPT) {
      checks = fixAttemptChecks(serviceCalls)
    }

    for (const { check, response } of checks) {
      if (await check(entity)) return { ok: false, message: response }
    }

    return { ok: true }
  }
})
