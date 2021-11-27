import { EntityType } from 'dcl-catalyst-commons'
import { anything, instance, mock, when } from 'ts-mockito'
import { FailedDeploymentsManager, FailureReason } from '../../../../src/service/errors/FailedDeploymentsManager'

export class NoOpFailedDeploymentsManager {
  static build(): FailedDeploymentsManager {
    const mockedManager: FailedDeploymentsManager = mock(FailedDeploymentsManager)
    when(mockedManager.getFailedDeployment(anything(), anything(), anything())).thenReturn(
      Promise.resolve({
        entityType: EntityType.PROFILE,
        entityId: 'id',
        failureTimestamp: 20,
        reason: FailureReason.DEPLOYMENT_ERROR,
        authChain: []
      })
    )
    return instance(mockedManager)
  }
}
