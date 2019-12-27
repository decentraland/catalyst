import { MetaverseContentService, ClusterAwareService } from "./Service";
import { Environment, Bean, EnvironmentConfig } from "../Environment";
import { ServiceImpl } from "./ServiceImpl";
import { ServiceStorage } from "./ServiceStorage";

export class ServiceFactory {
    static create(env: Environment): MetaverseContentService & ClusterAwareService {
        const serviceStorage = new ServiceStorage(env.getBean(Bean.STORAGE));
        return new ServiceImpl(
            serviceStorage,
            env.getBean(Bean.HISTORY_MANAGER),
            env.getBean(Bean.AUDIT),
            env.getBean(Bean.POINTER_MANAGER),
            env.getBean(Bean.NAME_KEEPER),
            env.getBean(Bean.ANALYTICS),
            env.getBean(Bean.ACCESS_CHECKER),
            env.getConfig(EnvironmentConfig.IGNORE_VALIDATION_ERRORS));
    }
}

