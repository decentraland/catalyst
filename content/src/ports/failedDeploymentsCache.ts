import { EntityId, EntityType } from 'dcl-catalyst-commons'
import { FailedDeployment } from '../service/errors/FailedDeploymentsManager'

const failedDeployments: Map<EntityId, FailedDeployment> = new Map()

export function getAllFailedDeployments(): FailedDeployment[] {
  return Array.from(failedDeployments.values())
}

export function findFailedDeployment(entityType: EntityType, entityId: EntityId): FailedDeployment | undefined {
  return failedDeployments.get(entityId)
}

export function reportSuccessfulDeployment(entityType: EntityType, entityId: EntityId): boolean {
  return failedDeployments.delete(entityId)
}

export function reportFailure(failedDeployment: FailedDeployment): void {
  failedDeployments.set(failedDeployment.entityId, failedDeployment)
}
