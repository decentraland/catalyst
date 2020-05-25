import { Environment, Bean, EnvironmentConfig } from "../Environment";
import { Denylist } from "./Denylist";

export class DenylistFactory {
    static create(env: Environment): Denylist {
        return new Denylist(env.getBean(Bean.REPOSITORY),
            env.getBean(Bean.AUTHENTICATOR),
            env.getBean(Bean.CONTENT_CLUSTER),
            env.getConfig(EnvironmentConfig.ETH_NETWORK))
    }
}