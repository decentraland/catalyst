/* eslint-disable @typescript-eslint/ban-ts-comment */
import { DeploymentsRepository } from '@katalyst/content/storage/repositories/DeploymentsRepository'
import { Repository } from '@katalyst/content/storage/Repository'
import { anything, instance, mock, when } from 'ts-mockito'

export class MockedRepository {
  static build(initialAmountOfDeployments: number = 0): Repository {
    const mockedRepository: Repository = mock<Repository>()
    mockedRepository.deployments = instance(this.mockDeploymentsRepository(initialAmountOfDeployments))
    when(mockedRepository.task(anything())).thenCall((call) => call(mockedRepository))
    when(mockedRepository.taskIf(anything())).thenCall((call) => call(mockedRepository))
    when(mockedRepository.tx(anything())).thenCall((call) => call(mockedRepository))
    when(mockedRepository.txIf(anything())).thenCall((call) => call(mockedRepository))
    // @ts-ignore
    when(mockedRepository.$pool).thenReturn({ end: () => Promise.resolve(undefined) })
    return instance(mockedRepository)
  }

  private static mockDeploymentsRepository(initialAmountOfDeployments: number): DeploymentsRepository {
    const deploymentRepository: DeploymentsRepository = mock<DeploymentsRepository>()
    when(deploymentRepository.getAmountOfDeployments()).thenResolve(initialAmountOfDeployments)
    return deploymentRepository
  }
}
