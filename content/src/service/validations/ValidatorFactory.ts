import { EntityType } from 'dcl-catalyst-commons'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { Validator, ValidatorImpl } from './Validator'

export class ValidatorFactory {
  static create(components: Pick<AppComponents, 'authenticator' | 'accessChecker' | 'env'>): Validator {
    return new ValidatorImpl({
      accessChecker: components.accessChecker,
      authenticator: components.authenticator,
      requestTtlBackwards: components.env.getConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS),
      maxUploadSizePerTypeInMB: new Map([
        [EntityType.SCENE, 15],
        [EntityType.PROFILE, 15],
        [EntityType.WEARABLE, 3]
      ]),
      wearableSizeLimitInMB: 2
    })
  }
}
