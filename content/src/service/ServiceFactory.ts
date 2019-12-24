import { Service } from "./Service";
import { Environment, Bean, EnvironmentConfig } from "../Environment";
import { ServiceImpl } from "./ServiceImpl";

export class ServiceFactory {
    static create(env: Environment): Service {
        return new ServiceImpl(
            env.getBean(Bean.STORAGE),
            env.getBean(Bean.HISTORY_MANAGER),
            env.getBean(Bean.POINTER_MANAGER),
            env.getBean(Bean.NAME_KEEPER),
            env.getBean(Bean.ANALYTICS),
            env.getConfig(EnvironmentConfig.IGNORE_VALIDATION_ERRORS));
    }
}

