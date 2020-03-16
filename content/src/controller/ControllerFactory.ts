import { Environment, Bean, EnvironmentConfig } from "../Environment";
import { Controller } from "./Controller";
import { DenylistServiceDecorator } from "../denylist/DenylistServiceDecorator";
import { Denylist } from "../denylist/Denylist";
import { MetaverseContentService } from "../service/Service";
import { HistoryManager } from "../service/history/HistoryManager";
import { FailedDeploymentsManager } from "../service/errors/FailedDeploymentsManager";
import { SynchronizationManager } from "../service/synchronization/SynchronizationManager";
import { ChallengeSupervisor } from "../service/synchronization/ChallengeSupervisor";

export class ControllerFactory {
    static create(env: Environment): Controller {
        const service: MetaverseContentService = env.getBean(Bean.SERVICE);
        const denylist: Denylist = env.getBean(Bean.DENYLIST);
        const historyManager: HistoryManager = env.getBean(Bean.HISTORY_MANAGER);
        const failedDeploymentsManager: FailedDeploymentsManager = env.getBean(Bean.FAILED_DEPLOYMENTS_MANAGER);
        const synchronizationManager: SynchronizationManager = env.getBean(Bean.SYNCHRONIZATION_MANAGER);
        const challengeSupervisor: ChallengeSupervisor = env.getBean(Bean.CHALLENGE_SUPERVISOR);
        const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK);
        return new Controller(new DenylistServiceDecorator(service, denylist), historyManager, denylist, failedDeploymentsManager, synchronizationManager, challengeSupervisor, ethNetwork);
    }
}