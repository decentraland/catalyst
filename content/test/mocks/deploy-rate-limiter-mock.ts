import { IDeployRateLimiterComponent } from '../../src/ports/deployRateLimiterComponent'

export function createNoOpDeployRateLimiter(): IDeployRateLimiterComponent {
  return {
    newDeployment: async () => {},
    isRateLimited: async () => false,
    newUnchangedDeployment: async () => {},
    isUnchangedDeploymentRateLimited: async () => false
  }
}
