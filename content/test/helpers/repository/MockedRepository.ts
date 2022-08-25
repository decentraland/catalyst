/* eslint-disable @typescript-eslint/ban-ts-comment */
import { anything, instance, mock, when } from 'ts-mockito'
import { Database } from '../../../src/repository/Database'
import { Repository } from '../../../src/repository/Repository'

export class MockedRepository {
  static build(): Repository {
    const mockedDatabase: Database = mock<Database>()
    when(mockedDatabase.task(anything())).thenCall((call) => call(mockedDatabase))
    when(mockedDatabase.taskIf(anything())).thenCall((call) => call(mockedDatabase))
    when(mockedDatabase.tx(anything())).thenCall((call) => call(mockedDatabase))
    when(mockedDatabase.txIf(anything())).thenCall((call) => call(mockedDatabase))
    const dbInstance = instance(mockedDatabase)

    const mockedRepository: Repository = mock<Repository>()
    when(mockedRepository.task(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.task(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.taskIf(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.taskIf(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.tx(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.tx(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.txIf(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.txIf(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.run(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.run(anything(), anything())).thenCall((call) => call(dbInstance))
    when(mockedRepository.reuseIfPresent(anything(), anything(), anything())).thenCall((db, call) =>
      call(db ?? dbInstance)
    )
    when(mockedRepository.reuseIfPresent(anything(), anything(), anything())).thenCall((db, call) =>
      call(db ?? dbInstance)
    )
    return instance(mockedRepository)
  }
}
