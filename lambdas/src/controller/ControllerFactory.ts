import { Bean, Environment, EnvironmentConfig } from '../Environment'
import { Controller } from './Controller'

export class ControllerFactory {
  static create(env: Environment): Controller {
    return new Controller(
      env.getBean(Bean.SERVICE),
      env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT),
      env.getConfig(EnvironmentConfig.MAX_SYNCHRONIZATION_TIME_IN_SECONDS),
      env.getConfig(EnvironmentConfig.MAX_DEPLOYMENT_OBTENTION_TIME_IN_SECONDS),
      env.getConfig(EnvironmentConfig.COMMS_SERVER_ADDRESS)
    )
  }
}
