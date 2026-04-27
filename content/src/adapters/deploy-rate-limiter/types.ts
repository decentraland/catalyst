import { EntityType } from '@dcl/schemas'

export type IDeployRateLimiterComponent = {
  newDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): void
  isRateLimited(entityType: EntityType, pointers: string[]): boolean
  newUnchangedDeployment(entityType: EntityType, pointers: string[], localTimestamp: number): void
  isUnchangedDeploymentRateLimited(entityType: EntityType, pointers: string[]): boolean
}

export type DeploymentRateLimitConfig = {
  defaultTtl: number
  defaultMax: number
  entitiesConfigTtl: Map<EntityType, number>
  entitiesConfigMax: Map<EntityType, number>
  entitiesConfigUnchangedTtl: Map<EntityType, number>
}
