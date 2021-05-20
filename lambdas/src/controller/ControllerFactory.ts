import { Bean, Environment } from '../Environment'
import { Controller } from './Controller'

export class ControllerFactory {
  static create(env: Environment): Controller {
    return new Controller(env.getBean(Bean.SERVICE))
  }
}
