import { DeploymentsRepository } from '@katalyst/content/repository/extensions/DeploymentsRepository'
import { SortingField, SortingOrder } from 'dcl-catalyst-commons'
import { anything, capture, deepEqual, instance, mock, verify, when } from 'ts-mockito'
import MockedDataBase from './MockedDataBase'

fdescribe('DeploymentRepository', () => {
  let repository: DeploymentsRepository
  let db: MockedDataBase

  beforeEach(() => {
    db = mock(MockedDataBase)
    repository = new DeploymentsRepository(instance(db) as any)
  })

  describe('areEntitiesDeployed', () => {
    beforeEach(() => {
      db = mock(MockedDataBase)
      repository = new DeploymentsRepository(instance(db) as any)
    })

    describe('when the entities list is not empty', () => {
      const dbResult = ['1', '2']

      beforeEach(() => {
        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve(dbResult))
      })

      it('should return a map of entity id to the deployment status', async () => {
        const entities = ['1', '3']
        const result = await repository.areEntitiesDeployed(entities)

        expect(result).toEqual(
          new Map([
            ['1', true],
            ['3', false]
          ])
        )

        verify(
          db.map('SELECT entity_id FROM deployments WHERE entity_id IN ($1:list)', deepEqual([entities]), anything())
        ).once()
      })
    })

    describe('when the entities list is empty', () => {
      it('should return an empty map', async () => {
        const result = await repository.areEntitiesDeployed([])

        expect(result).toEqual(new Map())

        verify(db.map(anything(), anything(), anything())).never()
      })
    })
  })

  describe('getAmountOfDeployments', () => {
    let result
    const expectedResult = [
      ['1', true],
      ['2', false]
    ]

    beforeEach(async () => {
      db = mock(MockedDataBase)
      repository = new DeploymentsRepository(instance(db) as any)

      when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve(expectedResult))
      result = await repository.getAmountOfDeployments()
    })

    it('should call the database with the expected query', () => {
      verify(
        db.map(`SELECT entity_type, COUNT(*) AS count FROM deployments GROUP BY entity_type`, deepEqual([]), anything())
      ).once()
    })

    it('should return a Map with the result', () => {
      expect(result).toEqual(new Map(expectedResult as any))
    })
  })

  describe('getHistoricalDeployments', () => {
    beforeEach(() => {
      db = mock(MockedDataBase)
      repository = new DeploymentsRepository(instance(db) as any)
    })

    describe('when it receives a field or order to sort by', () => {
      beforeEach(() => {
        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
      })

      it('should call the database with the expected sorting', async () => {
        await repository.getHistoricalDeployments(0, 10, undefined, {
          field: SortingField.ENTITY_TIMESTAMP,
          order: SortingOrder.ASCENDING
        })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`ORDER BY dep1.entity_timestamp ASC`)
      })
    })

    describe("when it doesn't receive a field or order to sort by", () => {
      beforeEach(() => {
        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
      })

      it('should call the database with the default sorting', async () => {
        await repository.getHistoricalDeployments(0, 10)

        const args = capture(db.map).last()

        expect(args[0]).toContain(`ORDER BY dep1.local_timestamp DESC`)
      })
    })
  })
})
