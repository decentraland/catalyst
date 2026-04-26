import { Entity } from '@dcl/schemas'
import { DeploymentContext } from '../../deployment-types'

export type EntityCheck = (entity: Entity) => boolean | Promise<boolean>

export interface ServiceCalls {
  areThereNewerEntities: EntityCheck
  isEntityDeployedAlready: EntityCheck
  isNotFailedDeployment: EntityCheck
  isEntityRateLimited: EntityCheck
  isRequestTtlBackwards: EntityCheck
}

export interface ServerValidator {
  validate(
    entity: Entity,
    context: DeploymentContext,
    serviceCalls: ServiceCalls
  ): Promise<{ ok: true } | { ok: false; message: string }>
}
