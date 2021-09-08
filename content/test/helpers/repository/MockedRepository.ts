/* eslint-disable @typescript-eslint/ban-ts-comment */
import { EntityType } from 'dcl-catalyst-commons'
import { anything, instance, mock, when } from 'ts-mockito'
import { Database } from '../../../src/repository/Database'
import { DeploymentsRepository } from '../../../src/repository/extensions/DeploymentsRepository'
import { Repository } from '../../../src/repository/Repository'

export class MockedRepository {
  static build(initialAmountOfDeployments: Map<EntityType, number> = new Map()): Repository {
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

  private static mockDeploymentsRepository(initialAmountOfDeployments: Map<EntityType, number>): DeploymentsRepository {
    const deploymentRepository: DeploymentsRepository = mock<DeploymentsRepository>()
    when(deploymentRepository.getAmountOfDeployments()).thenResolve(initialAmountOfDeployments)
    return deploymentRepository
  }
}
