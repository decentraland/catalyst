import { DeploymentsRepository } from '@katalyst/content/repository/extensions/DeploymentsRepository'
import { anything, capture, instance, mock, when } from 'ts-mockito'
import MockedDataBase from './MockedDataBase'

describe('DeploymentRepository', () => {
  let repository: DeploymentsRepository
  let db: MockedDataBase

  beforeEach(() => {
    db = mock(MockedDataBase)
    repository = new DeploymentsRepository(instance(db) as any)
  })

  describe('areEntitiesDeployed', () => {
    describe('when the entities list is not empty', () => {
      const dbResult = ['1', '2']

      beforeEach(() => {
        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve(dbResult))
      })

      fit('should return a map of entity id to the deployment status', async () => {
        const entities = ['1', '3']
        const result = await repository.areEntitiesDeployed(entities)

        const entitiesSet = new Set(dbResult)

        expect(result).toEqual(new Map(entities.map((entityId) => [entityId, entitiesSet.has(entityId)])))

        const args = capture(db.map).last()

        expect(args[0]).toEqual('SELECT entity_id FROM deployments WHERE entity_id IN ($1:list)')
        expect(args[1]).toEqual([entities])
      })
    })
  })
})
