import { DeploymentsRepository } from "@katalyst/content/storage/repositories/DeploymentsRepository";
import { Repository } from "@katalyst/content/storage/Repository";
import { mock, when, instance, anything } from "ts-mockito";

export class MockedRepository {

    static build() {
        const deploymentRepository: DeploymentsRepository = mock<DeploymentsRepository>()
        when(deploymentRepository.getAmountOfDeployments()).thenResolve(15)
        const mockedRepository: Repository = mock<Repository>()
        mockedRepository.deployments = instance(deploymentRepository)
        when(mockedRepository.task(anything())).thenCall(call => call(mockedRepository))
        when(mockedRepository.taskIf(anything())).thenCall(call => call(mockedRepository))
        when(mockedRepository.tx(anything())).thenCall(call => call(mockedRepository))
        when(mockedRepository.txIf(anything())).thenCall(call => call(mockedRepository))
        return instance(mockedRepository)
    }

}