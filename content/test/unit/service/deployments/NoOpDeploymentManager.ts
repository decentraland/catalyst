import { anything, instance, mock, when } from 'ts-mockito'
import { DeploymentManager } from '../../../../src/service/deployments/DeploymentManager'

export class NoOpDeploymentManager {
  static build(): DeploymentManager {
    const mockedManager: DeploymentManager = mock(DeploymentManager)
    when(mockedManager.areEntitiesDeployed(anything(), anything())).thenCall((_, ids) =>
      Promise.resolve(new Map(ids.map((id) => [id, false])))
    )
    return instance(mockedManager)
  }
}
