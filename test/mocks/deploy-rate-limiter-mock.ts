import { IDeployRateLimiterComponent } from '../../src/logic/deployment-service'

export function createNoOpDeployRateLimiter(): IDeployRateLimiterComponent {
  return {
    newDeployment: () => {},
    isRateLimited: () => false,
    newUnchangedDeployment: () => {},
    isUnchangedDeploymentRateLimited: () => false
  }
}
