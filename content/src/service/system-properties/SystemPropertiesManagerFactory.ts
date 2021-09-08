import { Bean, Environment } from '../../Environment'
import { SystemPropertiesManager } from './SystemProperties'

export class SystemPropertiesManagerFactory {
  static create(env: Environment): SystemPropertiesManager {
    return new SystemPropertiesManager(env.getBean(Bean.REPOSITORY))
  }
}
