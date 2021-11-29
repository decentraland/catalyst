import * as path from 'path'
import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { Repository } from '../../repository/Repository'
import { createSincronizationComponents } from './newSynchronization'
import { ClusterSynchronizationManager } from './SynchronizationManager'

export class ClusterSynchronizationManagerFactory {
  static async create(env: Environment): Promise<ClusterSynchronizationManager> {
    const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')

    const components = await createSincronizationComponents({
      database: env.getBean<Repository>(Bean.REPOSITORY).databaseComponent,
      contentStorageFolder: contentFolder,
      deploymentsService: env.getBean(Bean.SERVICE)
    })

    return new ClusterSynchronizationManager(
      components,
      env.getBean(Bean.CONTENT_CLUSTER),
      env.getConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION),
      env.getConfig(EnvironmentConfig.CHECK_SYNC_RANGE),
      contentFolder
    )
  }
}
