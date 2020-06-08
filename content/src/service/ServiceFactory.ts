import { MetaverseContentService, TimeKeepingService, ClusterDeploymentsService } from "./Service";
import { Environment, Bean, EnvironmentConfig } from "../Environment";
import { ServiceImpl } from "./ServiceImpl";

export class ServiceFactory {
    static create(env: Environment): MetaverseContentService & TimeKeepingService & ClusterDeploymentsService {
        return new ServiceImpl(
            env.getBean(Bean.SERVICE_STORAGE),
            env.getBean(Bean.HISTORY_MANAGER),
            env.getBean(Bean.POINTER_MANAGER),
            env.getBean(Bean.CONTENT_CLUSTER),
            env.getBean(Bean.DEPLOYMENT_REPORTER),
            env.getBean(Bean.FAILED_DEPLOYMENTS_MANAGER),
            env.getBean(Bean.DEPLOYMENT_MANAGER),
            env.getBean(Bean.VALIDATIONS),
            env.getBean(Bean.REPOSITORY),
            env.getBean(Bean.GARBAGE_COLLECTION_MANAGER),
            env.getConfig(EnvironmentConfig.ALLOW_DEPLOYMENTS_FOR_TESTING));
    }
}

