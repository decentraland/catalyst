import { Bean, Environment } from '@katalyst/content/Environment'
import { SystemPropertiesManager } from './SystemProperties'

export class SystemPropertiesManagerFactory {
  static create(env: Environment): SystemPropertiesManager {
    return new SystemPropertiesManager(env.getBean(Bean.REPOSITORY))
  }
}
