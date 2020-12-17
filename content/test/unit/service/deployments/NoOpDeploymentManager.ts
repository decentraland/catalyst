import { DeploymentManager } from '@katalyst/content/service/deployments/DeploymentManager'
import { anything, instance, mock, when } from 'ts-mockito'

export class NoOpDeploymentManager {
  static build(): DeploymentManager {
    const mockedManager: DeploymentManager = mock(DeploymentManager)
    when(mockedManager.areEntitiesDeployed(anything(), anything())).thenCall((_, ids) =>
      Promise.resolve(new Map(ids.map((id) => [id, false])))
    )
    return instance(mockedManager)
  }
}
