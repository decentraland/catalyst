import { Denylist } from '../denylist/Denylist'
import { DenylistServiceDecorator } from '../denylist/DenylistServiceDecorator'
import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { MetaverseContentService } from '../service/Service'
import { SnapshotManager } from '../service/snapshots/SnapshotManager'
import { ChallengeSupervisor } from '../service/synchronization/ChallengeSupervisor'
import { SynchronizationManager } from '../service/synchronization/SynchronizationManager'
import { Repository } from '../storage/Repository'
import { Controller } from './Controller'

export class ControllerFactory {
  static create(env: Environment): Controller {
    const repository: Repository = env.getBean(Bean.REPOSITORY)
    const service: MetaverseContentService = env.getBean(Bean.SERVICE)
    const denylist: Denylist = env.getBean(Bean.DENYLIST)
    const synchronizationManager: SynchronizationManager = env.getBean(Bean.SYNCHRONIZATION_MANAGER)
    const challengeSupervisor: ChallengeSupervisor = env.getBean(Bean.CHALLENGE_SUPERVISOR)
    const snapshotManager: SnapshotManager = env.getBean(Bean.SNAPSHOT_MANAGER)
    const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK)
    if (denylist && repository) {
      return new Controller(
        new DenylistServiceDecorator(service, denylist, repository),
        denylist,
        synchronizationManager,
        challengeSupervisor,
        snapshotManager,
        ethNetwork
      )
    } else {
      return new Controller(service, denylist, synchronizationManager, challengeSupervisor, snapshotManager, ethNetwork)
    }
  }
}
