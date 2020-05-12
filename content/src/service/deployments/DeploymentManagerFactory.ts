import { Environment, Bean } from "../../Environment"
import { DeploymentManager } from "./DeploymentManager"

export class DeploymentManagerFactory {

    static create(env: Environment): DeploymentManager {
        return new DeploymentManager(env.getBean(Bean.CACHE_MANAGER))
    }
}
