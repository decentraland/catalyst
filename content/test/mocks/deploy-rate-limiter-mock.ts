import { IDeployRateLimiterComponent } from '../../src/ports/deployRateLimiterComponent'

export function createNoOpDeployRateLimiter(): IDeployRateLimiterComponent {
  return {
    newDeployment: () => {},
    isRateLimited: () => false,
    newUnchangedDeployment: () => {},
    isUnchangedDeploymentRateLimited: () => false
  }
}
