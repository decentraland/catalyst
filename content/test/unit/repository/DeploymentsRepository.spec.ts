import { Entity, EntityType, EntityVersion } from 'dcl-catalyst-commons'
import { anything, capture, deepEqual, instance, mock, spy, verify, when } from 'ts-mockito'
import { DeploymentsRepository } from '../../../src/repository/extensions/DeploymentsRepository'
import MockedDataBase from './MockedDataBase'

describe('DeploymentRepository', () => {
  let repository: DeploymentsRepository
  let db: MockedDataBase

  beforeEach(() => {
    db = mock(MockedDataBase)
    repository = new DeploymentsRepository(instance(db) as any)
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
})
