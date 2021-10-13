import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { ClusterSynchronizationManager } from './SynchronizationManager'

export class ClusterSynchronizationManagerFactory {
  static create(env: Environment): ClusterSynchronizationManager {
    return new ClusterSynchronizationManager(
      env.getBean(Bean.CONTENT_CLUSTER),
      env.getBean(Bean.SYSTEM_PROPERTIES_MANAGER),
      env.getBean(Bean.EVENT_DEPLOYER),
      env.getBean(Bean.SERVICE),
      env.getConfig(EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL),
      env.getConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION),
      env.getConfig(EnvironmentConfig.CHECK_SYNC_RANGE)
    )
  }
}
