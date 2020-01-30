import { FailedDeploymentsManager } from "./FailedDeploymentsManager"
import { FailedDeploymentsStorage } from "./FailedDeploymentsStorage"
import { Bean, Environment } from "@katalyst/content/Environment"


export class FailedDeploymentsManagerFactory {

    static create(env: Environment): FailedDeploymentsManager {
        const storage: FailedDeploymentsStorage = new FailedDeploymentsStorage(env.getBean(Bean.STORAGE))
        return new FailedDeploymentsManager(storage)
    }
}
