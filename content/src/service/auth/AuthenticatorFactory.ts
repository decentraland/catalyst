import { Environment, EnvironmentConfig } from "@katalyst/content/Environment";
import { ContentAuthenticator } from "./Authenticator";

export class AuthenticatorFactory {
    static create(env: Environment): ContentAuthenticator {
        return new ContentAuthenticator(env.getConfig(EnvironmentConfig.DECENTRALAND_ADDRESS))
    }
}
