import { anything, deepEqual, instance, mock, spy, verify, when } from 'ts-mockito'
import { DeploymentsRepository } from '../../../src/repository/extensions/DeploymentsRepository'
import MockedDataBase from './MockedDataBase'

describe('DeploymentRepository', () => {
  let repository: DeploymentsRepository
  let db: MockedDataBase

  beforeEach(() => {
    db = mock(MockedDataBase)
    repository = new DeploymentsRepository(instance(db) as any)
  })

  describe('setEntitiesAsOverwritten', () => {
    const overwrittenBy = 150
    const overwrittenDeploymentId = 250
    const overwrittenDeployments = [
      overwrittenDeploymentId,
      overwrittenDeploymentId + 1,
      overwrittenDeploymentId + 2,
      overwrittenDeploymentId + 3
    ]

    beforeEach(() => {
      db = spy(new MockedDataBase())
      const dbInstance = instance(db)
      repository = new DeploymentsRepository(dbInstance as any)

      when(db.none(anything(), anything(), anything()))
        .thenReturn(...overwrittenDeployments.map((x) => x as any))
        .thenThrow(new Error('Unexpected call'))
        ; (dbInstance as any).txIf = (callBack) => callBack({ batch: dbInstance.batch })
    })

    it('should call the update for each override', async () => {
      await repository.setEntitiesAsOverwritten(new Set(overwrittenDeployments), overwrittenBy)

      overwrittenDeployments.forEach((overwrittenDeployment) => {
        verify(
          db.none(
            'UPDATE deployments SET deleter_deployment = $1 WHERE id = $2',
            deepEqual([overwrittenBy, overwrittenDeployment])
          )
        ).once()
      })

      verify(db.batch(anything())).once()
    })
  })
})
