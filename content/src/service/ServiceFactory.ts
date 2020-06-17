import { MetaverseContentService, ClusterDeploymentsService, LastKnownDeploymentService } from "./Service";
import { Environment, Bean } from "../Environment";
import { ServiceImpl } from "./ServiceImpl";
import { ServiceStorage } from "./ServiceStorage";

export class ServiceFactory {
    static create(env: Environment): MetaverseContentService & ClusterDeploymentsService & LastKnownDeploymentService {
        const serviceStorage = new ServiceStorage(env.getBean(Bean.STORAGE));
        return new ServiceImpl(
            serviceStorage,
            env.getBean(Bean.HISTORY_MANAGER),
            env.getBean(Bean.POINTER_MANAGER),
            env.getBean(Bean.CONTENT_CLUSTER),
            env.getBean(Bean.DEPLOYMENT_REPORTER),
            env.getBean(Bean.FAILED_DEPLOYMENTS_MANAGER),
            env.getBean(Bean.DEPLOYMENT_MANAGER),
            env.getBean(Bean.VALIDATIONS),
            env.getBean(Bean.REPOSITORY));
    }
}

