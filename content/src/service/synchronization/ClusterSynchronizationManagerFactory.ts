import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { ClusterSynchronizationManager } from './SynchronizationManager'
import * as path from 'path'

export class ClusterSynchronizationManagerFactory {
  static create(env: Environment): ClusterSynchronizationManager {
    const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    return new ClusterSynchronizationManager(
      env.getBean(Bean.CONTENT_CLUSTER),
      env.getBean(Bean.SYSTEM_PROPERTIES_MANAGER),
      env.getBean(Bean.SERVICE),
      env.getConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION),
      env.getConfig(EnvironmentConfig.CHECK_SYNC_RANGE),
      contentFolder
    )
  }
}
