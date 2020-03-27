import { Environment, Bean, EnvironmentConfig } from "@katalyst/content/Environment";
import { AccessCheckerImpl } from "./AccessCheckerImpl";

export class AccessCheckerImplFactory {
    static create(env: Environment): AccessCheckerImpl {
        return new AccessCheckerImpl(
            env.getBean(Bean.AUTHENTICATOR),
            env.getConfig(EnvironmentConfig.DCL_PARCEL_ACCESS_URL))
    }
}
