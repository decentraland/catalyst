import { Environment, Bean, EnvironmentConfig } from '@katalyst/content/Environment'
import { SnapshotManager } from './SnapshotManager'

export class SnapshotManagerFactory {
  static create(env: Environment): SnapshotManager {
    return new SnapshotManager(
      env.getBean(Bean.SYSTEM_PROPERTIES_MANAGER),
      env.getBean(Bean.REPOSITORY),
      env.getBean(Bean.SERVICE),
      env.getConfig(EnvironmentConfig.SNAPSHOT_FREQUENCY)
    )
  }
}
