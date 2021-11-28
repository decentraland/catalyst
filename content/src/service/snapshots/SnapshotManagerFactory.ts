import * as path from 'path'
import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { metricsComponent } from '../../metrics'
import { Repository } from '../../repository/Repository'
import { SnapshotManager } from './SnapshotManager'

export class SnapshotManagerFactory {
  static create(env: Environment): SnapshotManager {
    const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')

    return new SnapshotManager(
      {
        database: env.getBean<Repository>(Bean.REPOSITORY).databaseComponent,
        staticConfigs: {
          contentStorageFolder: contentFolder
        },
        metrics: metricsComponent
      },

      env.getBean(Bean.SYSTEM_PROPERTIES_MANAGER),
      env.getBean(Bean.REPOSITORY),
      env.getBean(Bean.SERVICE),
      env.getConfig(EnvironmentConfig.SNAPSHOT_FREQUENCY),
      env.getConfig(EnvironmentConfig.SNAPSHOT_FREQUENCY_IN_MILLISECONDS)
    )
  }
}
