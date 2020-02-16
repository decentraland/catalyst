import { Environment, Bean, EnvironmentConfig } from "../Environment";
import { Denylist } from "./Denylist";
import { DenylistStorage } from "./DenylistStorage";

export class DenylistFactory {
    static create(env: Environment): Denylist {
        return new Denylist(new DenylistStorage(env.getBean(Bean.STORAGE)),
            env.getBean(Bean.AUTHENTICATOR),
            env.getBean(Bean.CONTENT_CLUSTER),
            env.getConfig(EnvironmentConfig.ETH_NETWORK))
    }
}