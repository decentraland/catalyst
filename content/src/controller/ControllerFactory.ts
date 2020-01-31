import { Environment, Bean } from "../Environment";
import { Controller } from "./Controller";
import { BlacklistServiceDecorator } from "../blacklist/BlacklistServiceDecorator";
import { Blacklist } from "../blacklist/Blacklist";
import { MetaverseContentService } from "../service/Service";
import { HistoryManager } from "../service/history/HistoryManager";
import { FailedDeploymentsManager } from "../service/errors/FailedDeploymentsManager";

export class ControllerFactory {
    static create(env: Environment): Controller {
        const service: MetaverseContentService = env.getBean(Bean.SERVICE);
        const blacklist: Blacklist = env.getBean(Bean.BLACKLIST);
        const historyManager: HistoryManager = env.getBean(Bean.HISTORY_MANAGER);
        const failedDeploymentsManager: FailedDeploymentsManager = env.getBean(Bean.FAILED_DEPLOYMENTS_MANAGER);
        return new Controller(new BlacklistServiceDecorator(service, blacklist), historyManager, blacklist, failedDeploymentsManager);
    }
}