import { DeploymentsRepository } from '@katalyst/content/repository/extensions/DeploymentsRepository'
import { Entity } from '@katalyst/content/service/Entity'
import { EntityType, EntityVersion, SortingField, SortingOrder } from 'dcl-catalyst-commons'
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

    describe("when it doesn't receive a lastId", () => {
      beforeEach(() => {
        db = mock(MockedDataBase)
        repository = new DeploymentsRepository(instance(db) as any)
      })

      describe('when it receives a field or order to sort by', () => {
        beforeEach(() => {
          when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
        })

        it('should call the database with the expected sorting', async () => {
          await repository.getHistoricalDeployments(
            0,
            10,
            { from: 1, to: 11 },
            {
              field: SortingField.ENTITY_TIMESTAMP,
              order: SortingOrder.ASCENDING
            }
          )

          const args = capture(db.map).last()

          expect(args[0]).toContain(`ORDER BY dep1.entity_timestamp ASC`)
          expect(args[0]).toContain(
            `dep1.entity_timestamp >= to_timestamp($(fromEntityTimestamp) / 1000.0) AND dep1.entity_timestamp <= to_timestamp($(toEntityTimestamp) / 1000.0)`
          )
          expect(args[1]).toEqual(jasmine.objectContaining({ fromEntityTimestamp: 1, toEntityTimestamp: 11 }))
        })
      })

      describe("when it doesn't receive a field or order to sort by", () => {
        beforeEach(() => {
          when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
        })

        it('should call the database with the default sorting', async () => {
          await repository.getHistoricalDeployments(0, 10, { from: 1, to: 11 })

          const args = capture(db.map).last()

          expect(args[0]).toContain(`ORDER BY dep1.local_timestamp DESC`)
          expect(args[0]).toContain(
            `dep1.local_timestamp >= to_timestamp($(fromLocalTimestamp) / 1000.0) AND dep1.local_timestamp <= to_timestamp($(toLocalTimestamp) / 1000.0)`
          )
          expect(args[1]).toEqual(jasmine.objectContaining({ fromLocalTimestamp: 1, toLocalTimestamp: 11 }))
        })
      })
    })

    describe('when it receives a lastId', () => {
      const lastId = '1'

      beforeEach(() => {
        db = mock(MockedDataBase)
        repository = new DeploymentsRepository(instance(db) as any)
      })

      describe('when it receives a field or order to sort by', () => {
        beforeEach(() => {
          when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
        })

        it('should call the database with the expected sorting', async () => {
          await repository.getHistoricalDeployments(
            0,
            10,
            { from: 1, to: 11 },
            {
              field: SortingField.ENTITY_TIMESTAMP,
              order: SortingOrder.ASCENDING
            },
            lastId
          )

          const args = capture(db.map).last()

          expect(args[0]).toContain(`ORDER BY dep1.entity_timestamp ASC`)
          expect(args[0]).toContain(`((LOWER(dep1.entity_id) > LOWER($(lastId))`)
          expect(args[0]).toContain(
            `dep1.entity_timestamp = to_timestamp($(fromEntityTimestamp) / 1000.0)) ` +
              `OR (dep1.entity_timestamp > to_timestamp($(fromEntityTimestamp) / 1000.0))) ` +
              `AND dep1.entity_timestamp <= to_timestamp($(toEntityTimestamp) / 1000.0)`
          )

          expect(args[1]).toEqual(jasmine.objectContaining({ fromEntityTimestamp: 1, toEntityTimestamp: 11 }))
        })
      })

      describe("when it doesn't receive a field or order to sort by", () => {
        beforeEach(() => {
          when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
        })

        it('should call the database with the default sorting', async () => {
          await repository.getHistoricalDeployments(0, 10, { from: 1, to: 11 }, undefined, lastId)

          const args = capture(db.map).last()

          expect(args[0]).toContain(`ORDER BY dep1.local_timestamp DESC`)
          expect(args[0]).toContain(`((LOWER(dep1.entity_id) < LOWER($(lastId))`)
          expect(args[0]).toContain(
            `dep1.local_timestamp >= to_timestamp($(fromLocalTimestamp) / 1000.0) AND ` +
              `((LOWER(dep1.entity_id) < LOWER($(lastId)) AND dep1.local_timestamp = to_timestamp($(toLocalTimestamp) / 1000.0)) ` +
              `OR (dep1.local_timestamp < to_timestamp($(toLocalTimestamp) / 1000.0)))`
          )

          expect(args[1]).toEqual(jasmine.objectContaining({ fromLocalTimestamp: 1, toLocalTimestamp: 11 }))
        })
      })
    })

    describe('when there is a deployed by filter', () => {
      beforeEach(() => {
        db = mock(MockedDataBase)
        repository = new DeploymentsRepository(instance(db) as any)

        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
      })

      it('should add the expected where clause to the query with the addresses on lowercase', async () => {
        const deployedBy = ['jOn', 'aGus']
        await repository.getHistoricalDeployments(0, 10, { deployedBy })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`LOWER(dep1.deployer_address) IN ($(deployedBy:list))`)
        expect(args[1]).toEqual(jasmine.objectContaining({ deployedBy: deployedBy.map((x) => x.toLowerCase()) }))
      })
    })

    describe('when there is entityTypes filter', () => {
      beforeEach(() => {
        db = mock(MockedDataBase)
        repository = new DeploymentsRepository(instance(db) as any)

        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
      })

      it('should add the expected where clause to the query', async () => {
        const entityTypes = [EntityType.SCENE, EntityType.PROFILE]
        await repository.getHistoricalDeployments(0, 10, { entityTypes })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`dep1.entity_type IN ($(entityTypes:list))`)
        expect(args[1]).toEqual(jasmine.objectContaining({ entityTypes }))
      })
    })

    describe('when there is entityIds filter', () => {
      beforeEach(() => {
        db = mock(MockedDataBase)
        repository = new DeploymentsRepository(instance(db) as any)

        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
      })

      it('should add the expected where clause to the query', async () => {
        const entityIds = ['A custom string', 'Another custom string']

        await repository.getHistoricalDeployments(0, 10, { entityIds })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`dep1.entity_id IN ($(entityIds:list))`)
        expect(args[1]).toEqual(jasmine.objectContaining({ entityIds }))
      })
    })

    describe('when there is onlyCurrentlyPointed filter', () => {
      beforeEach(() => {
        db = mock(MockedDataBase)
        repository = new DeploymentsRepository(instance(db) as any)

        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
      })

      it('should add the expected where clause to the query', async () => {
        await repository.getHistoricalDeployments(0, 10, { onlyCurrentlyPointed: true })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`dep1.deleter_deployment IS NULL`)
      })
    })

    describe('when there is pointers filter', () => {
      beforeEach(() => {
        db = mock(MockedDataBase)
        repository = new DeploymentsRepository(instance(db) as any)

        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
      })

      it('should add the expected where clause to the query with the pointers in lowercase', async () => {
        const pointers = ['jOn', 'aGus']
        await repository.getHistoricalDeployments(0, 10, { pointers })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`dep1.entity_pointers && ARRAY[$(pointers:list)]`)
        expect(args[1]).toEqual(jasmine.objectContaining({ pointers: pointers.map((x) => x.toLowerCase()) }))
      })
    })

    describe('when there is no filter', () => {
      beforeEach(() => {
        db = mock(MockedDataBase)
        repository = new DeploymentsRepository(instance(db) as any)

        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
      })

      it('should not add a where clause', async () => {
        await repository.getHistoricalDeployments(0, 10)

        const args = capture(db.map).last()

        expect(args[0]).not.toContain(`WHERE`)
      })
    })
  })

  describe('getSnapshot', () => {
    beforeEach(() => {
      db = mock(MockedDataBase)
      repository = new DeploymentsRepository(instance(db) as any)

      const dbResult = ['1', '2']
      when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve(dbResult))
    })

    it('should return a map of entity id to the deployment status', async () => {
      const entityType = EntityType.PROFILE
      await repository.getSnapshot(entityType)

      const expectedQuery = `SELECT entity_id, entity_pointers, date_part('epoch', local_timestamp) * 1000 AS local_timestamp FROM deployments WHERE entity_type = $1 AND deleter_deployment IS NULL ORDER BY local_timestamp DESC, entity_id DESC`

      verify(db.map(expectedQuery, deepEqual([entityType]), anything())).once()
    })
  })

  describe('deploymentsSince', () => {
    beforeEach(() => {
      db = mock(MockedDataBase)
      repository = new DeploymentsRepository(instance(db) as any)

      when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
    })

    it('should call the db with the expected query', async () => {
      const entityType = EntityType.PROFILE
      await repository.getSnapshot(entityType)

      const expectedQuery = `SELECT entity_id, entity_pointers, date_part('epoch', local_timestamp) * 1000 AS local_timestamp FROM deployments WHERE entity_type = $1 AND deleter_deployment IS NULL ORDER BY local_timestamp DESC, entity_id DESC`

      const args = capture(db.map).last()
      expect(args[0]).toEqual(expectedQuery)

      verify(db.map(expectedQuery, deepEqual([entityType]), anything())).once()
    })
  })

  describe('saveDeployment', () => {
    beforeEach(() => {
      db = mock(MockedDataBase)
      repository = new DeploymentsRepository(instance(db) as any)

      when(db.one(anything(), anything(), anything())).thenReturn(Promise.resolve({}))
    })

    describe('when there is no metadata', () => {
      it('should call the db with the expected query and null metadata', async () => {
        const entity: Entity = { id: '1', pointers: [], timestamp: 1, type: EntityType.PROFILE }
        const auditInfo = { authChain: [], localTimestamp: 2, version: EntityVersion.V3 }
        const overwrittenBy = 10
        await repository.saveDeployment(entity, auditInfo, overwrittenBy)

        const expectedQuery = `INSERT INTO deployments (deployer_address, version, entity_type, entity_id, entity_timestamp, entity_pointers, entity_metadata, local_timestamp, auth_chain, deleter_deployment) VALUES ($(deployer), $(auditInfo.version), $(entity.type), $(entity.id), to_timestamp($(entity.timestamp) / 1000.0), $(entity.pointers), $(metadata), to_timestamp($(auditInfo.localTimestamp) / 1000.0), $(auditInfo.authChain:json), $(overwrittenBy)) RETURNING id`

        const args = capture(db.one).last()
        expect(args[0]).toEqual(expectedQuery)

        verify(
          db.one(
            expectedQuery,
            deepEqual({
              entity,
              auditInfo,
              metadata: null,
              deployer: 'Invalid-Owner-Address',
              overwrittenBy
            }),
            anything()
          )
        ).once()
      })
    })

    describe('when there is no metadata', () => {
      it('should call the db with the expected query and the metadata value', async () => {
        const metadata = { aField: 'aValue' }
        const entity: Entity = { id: '1', pointers: [], timestamp: 1, type: EntityType.PROFILE, metadata }
        const auditInfo = { authChain: [], localTimestamp: 2, version: EntityVersion.V3 }
        const overwrittenBy = 10
        await repository.saveDeployment(entity, auditInfo, overwrittenBy)

        const expectedQuery = `INSERT INTO deployments (deployer_address, version, entity_type, entity_id, entity_timestamp, entity_pointers, entity_metadata, local_timestamp, auth_chain, deleter_deployment) VALUES ($(deployer), $(auditInfo.version), $(entity.type), $(entity.id), to_timestamp($(entity.timestamp) / 1000.0), $(entity.pointers), $(metadata), to_timestamp($(auditInfo.localTimestamp) / 1000.0), $(auditInfo.authChain:json), $(overwrittenBy)) RETURNING id`

        const args = capture(db.one).last()
        expect(args[0]).toEqual(expectedQuery)

        verify(
          db.one(
            expectedQuery,
            deepEqual({
              entity,
              auditInfo,
              metadata: { v: metadata },
              deployer: 'Invalid-Owner-Address',
              overwrittenBy
            }),
            anything()
          )
        ).once()
      })
    })
  })
  describe('setEntitiesAsOverwritten', () => {})
})
