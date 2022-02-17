import { Entity } from 'dcl-catalyst-commons'
import ms from 'ms'
import { AppComponents } from '../../types'
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
const isRequestTtlForwards: EntityCheck = (entity) => Date.now() - entity.timestamp < -REQUEST_TTL_FORWARDS

/**
 * Checks when context is DeploymentContext.LOCAL
 */
const localChecks = async (
  entity: Entity,
  serviceCalls: ServiceCalls,
  components: Pick<AppComponents, 'metrics'>
): Promise<string | undefined> => {
  /** Validate that there are no newer deployments on the entity's pointers */
  if (await serviceCalls.areThereNewerEntities(entity))
    return `There is a newer entity pointed by one or more of the pointers you provided (entityId=${
      entity.id
    } pointers=${entity.pointers.join(',')}).`

  /** Validate if the entity can be re deployed or not */
  if (await serviceCalls.isEntityDeployedAlready(entity))
    return `This entity was already deployed. You can't redeploy it`

  /** Validate the deployment is not rate limited */
  if (await serviceCalls.isEntityRateLimited(entity)) {
    components.metrics.increment('dcl_content_rate_limited_deployments_total', { entity_type: entity.type })
    return `Entity rate limited (entityId=${entity.id} pointers=${entity.pointers.join(',')}).`
  }

  /** Validate that the deployment is recent */
  if (await serviceCalls.isRequestTtlBackwards(entity))
    return `The request is not recent enough, please submit it again with a new timestamp (entityId=${
      entity.id
    } pointers=${entity.pointers.join(',')}).`

  /** Validate that the deployment is not too far in the future */
  if (isRequestTtlForwards(entity))
    return `The request is too far in the future, please submit it again with a new timestamp (entityId=${
      entity.id
    } pointers=${entity.pointers.join(',')}).`
}

/**
 * Checks when context is DeploymentContext.FIX_ATTEMPT
 */
const fixAttemptChecks = async (entity: Entity, serviceCalls: ServiceCalls): Promise<string | undefined> => {
  /** Make sure that the deployment actually failed, and that it can be re-deployed */
  if (await serviceCalls.isNotFailedDeployment(entity))
    return 'You are trying to fix an entity that is not marked as failed'
}

export const IGNORING_FIX_ERROR = 'Ignoring fix for failed deployment since there are newer entities. '

/**
 * Server side validations for current deploying entity for LOCAL and FIX_ATTEMPT contexts
 */
export const createServerValidator = (
  components: Pick<AppComponents, 'failedDeploymentsCache' | 'metrics'>
): ServerValidator => ({
  validate: async (entity, context, serviceCalls) => {
    // these contexts doesn't validate anything in this side
    if (context === DeploymentContext.SYNCED || context === DeploymentContext.SYNCED_LEGACY_ENTITY) {
      return { ok: true }
    }

    if (context === DeploymentContext.LOCAL) {
      const error = await localChecks(entity, serviceCalls, components)
      if (error) {
        return { ok: false, message: error }
      }
    } else if (context === DeploymentContext.FIX_ATTEMPT) {
      // if there are newer entities, we can end up in a loop (unfixeable failed deployment)
      // so we remove it from failed deployments cache

      if (await serviceCalls.areThereNewerEntities(entity)) {
        components.failedDeploymentsCache.removeFailedDeployment(entity.id)
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
})
