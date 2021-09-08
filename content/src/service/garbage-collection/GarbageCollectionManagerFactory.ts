import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { GarbageCollectionManager } from './GarbageCollectionManager'

export class GarbageCollectionManagerFactory {
  static create(env: Environment): GarbageCollectionManager {
    return new GarbageCollectionManager(
      env.getBean(Bean.SYSTEM_PROPERTIES_MANAGER),
      env.getBean(Bean.REPOSITORY),
      env.getBean(Bean.SERVICE),
      env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION),
      env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL)
    )
  }
}
