import { mock, instance } from "ts-mockito"
import { DeploymentManager } from "@katalyst/content/service/deployments/DeploymentManager"

export class NoOpDeploymentManager {

    static build(): DeploymentManager {
        const mockedManager: DeploymentManager = mock(DeploymentManager)
        return instance(mockedManager)
    }
}