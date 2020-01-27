import { Environment, EnvironmentConfig } from "@katalyst/content/Environment";
import { Authenticator } from "./Authenticator";

export class AuthenticatorFactory {
    static create(env: Environment): Authenticator {
        return new Authenticator(env.getConfig(EnvironmentConfig.DECENTRALAND_ADDRESS))
    }
}
