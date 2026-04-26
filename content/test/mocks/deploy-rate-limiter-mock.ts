import { IDeployRateLimiterComponent } from '../../src/adapters/deploy-rate-limiter'

export function createNoOpDeployRateLimiter(): IDeployRateLimiterComponent {
  return {
    newDeployment: () => {},
    isRateLimited: () => false,
    newUnchangedDeployment: () => {},
    isUnchangedDeploymentRateLimited: () => false
  }
}
