import { Environment, Bean, EnvironmentConfig } from "../Environment";
import { Controller } from "./Controller";
import { DenylistServiceDecorator } from "../denylist/DenylistServiceDecorator";
import { Denylist } from "../denylist/Denylist";
import { MetaverseContentService } from "../service/Service";
import { SynchronizationManager } from "../service/synchronization/SynchronizationManager";
import { ChallengeSupervisor } from "../service/synchronization/ChallengeSupervisor";
import { Repository } from "../storage/Repository";

export class ControllerFactory {
    static create(env: Environment): Controller {
        const repository: Repository = env.getBean(Bean.REPOSITORY);
        const service: MetaverseContentService = env.getBean(Bean.SERVICE);
        const denylist: Denylist = env.getBean(Bean.DENYLIST);
        const synchronizationManager: SynchronizationManager = env.getBean(Bean.SYNCHRONIZATION_MANAGER);
        const challengeSupervisor: ChallengeSupervisor = env.getBean(Bean.CHALLENGE_SUPERVISOR);
        const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK);
        if (denylist && repository) {
            return new Controller(new DenylistServiceDecorator(service, denylist, repository), denylist, synchronizationManager, challengeSupervisor, ethNetwork);
        } else {
            return new Controller(service, denylist, synchronizationManager, challengeSupervisor, ethNetwork);
        }
    }
}