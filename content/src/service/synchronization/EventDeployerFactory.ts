import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { EventDeployer } from './EventDeployer'

export class EventDeployerFactory {
  static create(env: Environment): EventDeployer {
    return new EventDeployer(
      env.getBean(Bean.CONTENT_CLUSTER),
      env.getBean(Bean.SERVICE),
      env.getConfig(EnvironmentConfig.SYNC_STREAM_TIMEOUT)
    )
  }
}
