import { mock, instance, when, anything } from "ts-mockito";
import { EntityType } from "dcl-catalyst-commons";
import { FailedDeploymentsManager, FailureReason } from "@katalyst/content/service/errors/FailedDeploymentsManager";

export class NoOpFailedDeploymentsManager {

    static build(): FailedDeploymentsManager {
        const mockedManager: FailedDeploymentsManager = mock(FailedDeploymentsManager)
        when(mockedManager.getFailedDeployment(anything(), anything(), anything())).thenReturn(Promise.resolve({
            entityType: EntityType.PROFILE,
            entityId: 'id',
            originTimestamp: 10,
            originServerUrl: 'ServerAddress',
            failureTimestamp: 20,
            reason: FailureReason.DEPLOYMENT_ERROR,
        }))
        return instance(mockedManager)
    }

}