import { Bean, Environment } from '@katalyst/lambdas/Environment'
import { OffChainWearablesManager } from './OffChainWearablesManager'

export class OffChainWearablesManagerFactory {
  static create(env: Environment): OffChainWearablesManager {
    return new OffChainWearablesManager(env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT))
  }
}
