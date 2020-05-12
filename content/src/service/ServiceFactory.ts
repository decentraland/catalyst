import { MetaverseContentService, TimeKeepingService, ClusterDeploymentsService } from "./Service";
import { Environment, Bean, EnvironmentConfig } from "../Environment";
import { ServiceImpl } from "./ServiceImpl";
import { ServiceStorage } from "./ServiceStorage";

export class ServiceFactory {
    static create(env: Environment): MetaverseContentService & TimeKeepingService & ClusterDeploymentsService {
        const serviceStorage = new ServiceStorage(env.getBean(Bean.STORAGE));
        return new ServiceImpl(
            serviceStorage,
            env.getBean(Bean.HISTORY_MANAGER),
            env.getBean(Bean.POINTER_MANAGER),
            env.getBean(Bean.CONTENT_CLUSTER),
            env.getBean(Bean.DEPLOYMENT_REPORTER),
            env.getBean(Bean.FAILED_DEPLOYMENTS_MANAGER),
            env.getBean(Bean.CACHE_MANAGER),
            env.getBean(Bean.VALIDATIONS),
            env.getBean(Bean.DEPLOYMENT_MANAGER),
            env.getConfig(EnvironmentConfig.IGNORE_VALIDATION_ERRORS),
            env.getConfig(EnvironmentConfig.ALLOW_DEPLOYMENTS_FOR_TESTING));
    }
}

