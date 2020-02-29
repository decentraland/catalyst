import { Environment, Bean, EnvironmentConfig } from "@katalyst/content/Environment";
import { Validations } from "./Validations";

export class ValidationsFactory {

    static create(env: Environment): Validations {
        return new Validations(env.getBean(Bean.ACCESS_CHECKER),
            env.getBean(Bean.AUTHENTICATOR),
            env.getBean(Bean.FAILED_DEPLOYMENTS_MANAGER),
            env.getConfig(EnvironmentConfig.ETH_NETWORK),
            env.getConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS))
    }
}