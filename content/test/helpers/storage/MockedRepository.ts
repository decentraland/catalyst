/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Database } from '@katalyst/content/storage/Database'
import { DeploymentsRepository } from '@katalyst/content/storage/repositories/DeploymentsRepository'
import { Repository } from '@katalyst/content/storage/Repository'
import { anything, instance, mock, when } from 'ts-mockito'

export class MockedRepository {
  static build(initialAmountOfDeployments: number = 0): Repository {
    const mockedDatabase: Database = mock<Database>()
    when(mockedDatabase.task(anything())).thenCall((call) => call(mockedDatabase))
    when(mockedDatabase.taskIf(anything())).thenCall((call) => call(mockedDatabase))
    when(mockedDatabase.tx(anything())).thenCall((call) => call(mockedDatabase))
    when(mockedDatabase.txIf(anything())).thenCall((call) => call(mockedDatabase))
    const dbInstance = instance(mockedDatabase)
    dbInstance.deployments = instance(this.mockDeploymentsRepository(initialAmountOfDeployments))

    const mockedRepository: Repository = mock<Repository>()
    when(mockedRepository.task(anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.task(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.taskIf(anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.taskIf(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.tx(anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.tx(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.txIf(anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.txIf(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.run(anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.run(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.reuseIfPresent(anything(), anything())).thenCall((db, call) => call(db ?? dbInstance))
    when(mockedRepository.reuseIfPresent(anything(), anything(), anything())).thenCall((db, call) =>
      call(db ?? dbInstance)
    )
    return instance(mockedRepository)
  }

  private static mockDeploymentsRepository(initialAmountOfDeployments: number): DeploymentsRepository {
    const deploymentRepository: DeploymentsRepository = mock<DeploymentsRepository>()
    when(deploymentRepository.getAmountOfDeployments()).thenResolve(initialAmountOfDeployments)
    return deploymentRepository
  }
}
