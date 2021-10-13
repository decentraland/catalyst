import { Environment, EnvironmentConfig } from '../../Environment'
import { ContentAuthenticator } from './Authenticator'

export class AuthenticatorFactory {
  static create(env: Environment): ContentAuthenticator {
    return new ContentAuthenticator(
      env.getConfig(EnvironmentConfig.ETH_NETWORK),
      env.getConfig(EnvironmentConfig.DECENTRALAND_ADDRESS)
    )
  }
}
