import { EntityType, EntityVersion, SortingField, SortingOrder } from 'dcl-catalyst-commons'
import { anything, capture, deepEqual, instance, mock, spy, verify, when } from 'ts-mockito'
import { DeploymentsRepository } from '../../../src/repository/extensions/DeploymentsRepository'
import { Entity } from '../../../src/service/Entity'
import MockedDataBase from './MockedDataBase'

describe('DeploymentRepository', () => {
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
      const entities = ['1', '3']
      let result

      beforeEach(async () => {
        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve(dbResult))
        result = await repository.areEntitiesDeployed(entities)
      })

      it('should return a map of entity id to the deployment status', async () => {
        expect(result).toEqual(
          new Map([
            ['1', true],
            ['3', false]
          ])
        )
      })

      it('should call the db with the expected parameters', () => {
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

    it('should call the database to obtain the count of deployments by entity type', () => {
      verify(
        db.map(`SELECT entity_type, COUNT(*) AS count FROM deployments GROUP BY entity_type`, deepEqual([]), anything())
      ).once()
    })

    it('should return a Map with the result', () => {
      expect(result).toEqual(new Map(expectedResult as any))
    })
  })

  describe('getHistoricalDeployments', () => {
    describe("when it doesn't receive a lastId", () => {
      beforeEach(() => {
        db = mock(MockedDataBase)
        repository = new DeploymentsRepository(instance(db) as any)
        when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve([]))
      })

      describe('when it receives a field or order to sort by', () => {
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
        expect(args[1]).toEqual(jasmine.objectContaining({ deployedBy: ['jon', 'agus'] }))
      })
    })

    describe('when there is entityTypes filter', () => {
      it('should add the expected where clause to the query', async () => {
        const entityTypes = [EntityType.SCENE, EntityType.PROFILE]
        await repository.getHistoricalDeployments(0, 10, { entityTypes })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`dep1.entity_type IN ($(entityTypes:list))`)
        expect(args[1]).toEqual(jasmine.objectContaining({ entityTypes }))
      })
    })

    describe('when there is entityIds filter', () => {
      it('should add the expected where clause to the query', async () => {
        const entityIds = ['A custom string', 'Another custom string']

        await repository.getHistoricalDeployments(0, 10, { entityIds })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`dep1.entity_id IN ($(entityIds:list))`)
        expect(args[1]).toEqual(jasmine.objectContaining({ entityIds }))
      })
    })

    describe('when there is onlyCurrentlyPointed filter', () => {
      it('should add the expected where clause to the query', async () => {
        await repository.getHistoricalDeployments(0, 10, { onlyCurrentlyPointed: true })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`dep1.deleter_deployment IS NULL`)
      })
    })

    describe('when there is pointers filter', () => {
      it('should add the expected where clause to the query with the pointers in lowercase', async () => {
        const pointers = ['jOn', 'aGus']
        await repository.getHistoricalDeployments(0, 10, { pointers })

        const args = capture(db.map).last()

        expect(args[0]).toContain(`dep1.entity_pointers && ARRAY[$(pointers:list)]`)
        expect(args[1]).toEqual(jasmine.objectContaining({ pointers: pointers.map((x) => x.toLowerCase()) }))
      })
    })

    describe('when there is no filter', () => {
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
        const entity: Entity = {
          version: EntityVersion.V3,
          id: '1',
          pointers: [],
          timestamp: 1,
          type: EntityType.PROFILE
        }
        const auditInfo = { authChain: [], localTimestamp: 2, version: EntityVersion.V3 }
        const overwrittenBy = 10
        await repository.saveDeployment(entity, auditInfo, overwrittenBy)

        const expectedQuery = `INSERT INTO deployments (deployer_address, version, entity_type, entity_id, entity_timestamp, entity_pointers, entity_metadata, local_timestamp, auth_chain, deleter_deployment) VALUES ($(deployer), $(entity.version), $(entity.type), $(entity.id), to_timestamp($(entity.timestamp) / 1000.0), $(entity.pointers), $(metadata), to_timestamp($(auditInfo.localTimestamp) / 1000.0), $(auditInfo.authChain:json), $(overwrittenBy)) RETURNING id`

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
        const entity: Entity = {
          version: EntityVersion.V3,
          id: '1',
          pointers: [],
          timestamp: 1,
          type: EntityType.PROFILE,
          metadata
        }
        const auditInfo = { authChain: [], localTimestamp: 2, version: EntityVersion.V3 }
        const overwrittenBy = 10
        await repository.saveDeployment(entity, auditInfo, overwrittenBy)

        const expectedQuery = `INSERT INTO deployments (deployer_address, version, entity_type, entity_id, entity_timestamp, entity_pointers, entity_metadata, local_timestamp, auth_chain, deleter_deployment) VALUES ($(deployer), $(entity.version), $(entity.type), $(entity.id), to_timestamp($(entity.timestamp) / 1000.0), $(entity.pointers), $(metadata), to_timestamp($(auditInfo.localTimestamp) / 1000.0), $(auditInfo.authChain:json), $(overwrittenBy)) RETURNING id`

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
      ;(dbInstance as any).txIf = (callBack) => callBack({ batch: dbInstance.batch })
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

  describe('getDeploymentByHash', () => {
    const dbResult = ['1', '2']
    const hashToSearch = 'myCustomHash'

    beforeEach(async () => {
      db = mock(MockedDataBase)
      repository = new DeploymentsRepository(instance(db) as any)

      when(db.map(anything(), anything(), anything())).thenReturn(Promise.resolve(dbResult))
      await repository.getActiveDeploymentsByContentHash(hashToSearch)
    })

    it('should call the db with the expected parameters', () => {
      const expectedQuery = `SELECT deployment.entity_id FROM deployments as deployment INNER JOIN content_files ON content_files.deployment=id WHERE content_hash=$1 AND deployment.deleter_deployment IS NULL;`

      verify(db.map(expectedQuery, deepEqual([hashToSearch]), anything())).once()
    })
  })
})
