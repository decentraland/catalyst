import { Environment } from '../../Environment'
import { DeploymentManager } from './DeploymentManager'

export class DeploymentManagerFactory {
  static create(env: Environment): DeploymentManager {
    return new DeploymentManager()
  }
}
