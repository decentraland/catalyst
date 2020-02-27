import { MetaverseContentService, TimeKeepingService, ClusterDeploymentsService } from "./Service";
import { Environment, Bean, EnvironmentConfig } from "../Environment";
import { ServiceImpl } from "./ServiceImpl";
import { ServiceStorage } from "./ServiceStorage";

export class ServiceFactory {
    static create(env: Environment): Promise<MetaverseContentService & TimeKeepingService & ClusterDeploymentsService> {
        const serviceStorage = new ServiceStorage(env.getBean(Bean.STORAGE));
        return ServiceImpl.build(
            serviceStorage,
            env.getBean(Bean.HISTORY_MANAGER),
            env.getBean(Bean.AUDIT),
            env.getBean(Bean.POINTER_MANAGER),
            env.getBean(Bean.NAME_KEEPER),
            env.getBean(Bean.ANALYTICS),
            env.getBean(Bean.ACCESS_CHECKER),
            env.getBean(Bean.AUTHENTICATOR),
            env.getBean(Bean.FAILED_DEPLOYMENTS_MANAGER),
            env.getBean(Bean.CACHE_MANAGER),
            env.getConfig(EnvironmentConfig.IGNORE_VALIDATION_ERRORS),
            env.getConfig(EnvironmentConfig.ETH_NETWORK));
    }
}

