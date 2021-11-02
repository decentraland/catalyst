import { EntityType } from 'dcl-catalyst-commons'
import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { Validator, ValidatorImpl } from './Validator'

export class ValidatorFactory {
  static create(env: Environment): Validator {
    return new ValidatorImpl({
      accessChecker: env.getBean(Bean.ACCESS_CHECKER),
      authenticator: env.getBean(Bean.AUTHENTICATOR),
      requestTtlBackwards: env.getConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS),
      maxUploadSizePerTypeInMB: new Map([
        [EntityType.SCENE, 15],
        [EntityType.PROFILE, 15],
        [EntityType.WEARABLE, 3]
      ]),
      wearableSizeLimitInMB: 2
    })
  }
}
