import { Entity, EntityType } from '@dcl/schemas'
import { DatabaseClient } from '../../../../src/adapters/database'
import { IDeploymentsRepository } from '../../../../src/adapters/deployments-repository'
import {
  DELTA_POINTER_RESULT,
  PointerDeltaMap,
  referenceEntityFromPointers
} from '../../../../src/logic/deployment-service/pointer-bookkeeping'

function buildEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-id',
    type: EntityType.SCENE,
    pointers: ['0,0'],
    timestamp: 1,
    content: [],
    metadata: {},
    version: 'v3',
    ...overrides
  }
}

describe('when referencing an entity from its pointers', () => {
  let database: DatabaseClient
  let deploymentsRepository: jest.Mocked<IDeploymentsRepository>

  beforeEach(() => {
    database = {} as DatabaseClient
    deploymentsRepository = {
      deploymentExists: jest.fn(),
      streamAllEntityIdsInTimeRange: jest.fn(),
      streamAllDistinctEntityIds: jest.fn(),
      getHistoricalDeployments: jest.fn(),
      getActiveDeploymentsByContentHash: jest.fn(),
      getEntityById: jest.fn(),
      saveDeployment: jest.fn(),
      getDeployments: jest.fn(),
      setEntitiesAsOverwritten: jest.fn(),
      calculateOverwrote: jest.fn(),
      calculateOverwrittenByManyFast: jest.fn(),
      calculateOverwrittenBySlow: jest.fn()
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and the entity has already been overwritten by a newer deployment', () => {
    let result: PointerDeltaMap

    beforeEach(async () => {
      result = await referenceEntityFromPointers(
        deploymentsRepository,
        database,
        buildEntity({ pointers: ['0,0', '0,1'] }),
        new Set([10, 11]),
        true
      )
    })

    it('should return an empty result', () => {
      expect(result.size).toBe(0)
    })

    it('should not query the deployments repository for the overwritten deployments', () => {
      expect(deploymentsRepository.getDeployments).not.toHaveBeenCalled()
    })
  })

  describe('and the entity is the latest active deployment for its pointers', () => {
    describe('and there are no previously overwritten deployments', () => {
      let entity: Entity
      let result: PointerDeltaMap

      beforeEach(async () => {
        entity = buildEntity({ pointers: ['0,0', '0,1'] })
        deploymentsRepository.getDeployments.mockResolvedValueOnce([])
        result = await referenceEntityFromPointers(deploymentsRepository, database, entity, new Set(), false)
      })

      it('should query the repository with the empty overwritten id set', () => {
        expect(deploymentsRepository.getDeployments).toHaveBeenCalledWith(database, new Set())
      })

      it('should mark every entity pointer as SET with no previous deployment id', () => {
        expect(result.get('0,0')).toEqual({ before: undefined, after: DELTA_POINTER_RESULT.SET })
        expect(result.get('0,1')).toEqual({ before: undefined, after: DELTA_POINTER_RESULT.SET })
      })
    })

    describe('and an overwritten deployment shares a pointer with the new entity', () => {
      let entity: Entity
      let result: PointerDeltaMap

      beforeEach(async () => {
        entity = buildEntity({ pointers: ['0,0', '0,1'] })
        deploymentsRepository.getDeployments.mockResolvedValueOnce([{ id: 42, pointers: ['0,0'] }])
        result = await referenceEntityFromPointers(deploymentsRepository, database, entity, new Set([42]), false)
      })

      it('should mark the shared pointer as SET with the previous deployment id as `before`', () => {
        expect(result.get('0,0')).toEqual({ before: 42, after: DELTA_POINTER_RESULT.SET })
      })

      it('should mark the non-shared pointer as SET with no previous deployment id', () => {
        expect(result.get('0,1')).toEqual({ before: undefined, after: DELTA_POINTER_RESULT.SET })
      })
    })

    describe('and an overwritten deployment has pointers not present in the new entity', () => {
      let entity: Entity
      let result: PointerDeltaMap

      beforeEach(async () => {
        entity = buildEntity({ pointers: ['0,0'] })
        deploymentsRepository.getDeployments.mockResolvedValueOnce([{ id: 42, pointers: ['0,0', '1,1'] }])
        result = await referenceEntityFromPointers(deploymentsRepository, database, entity, new Set([42]), false)
      })

      it('should mark the entity pointer as SET with the previous deployment id', () => {
        expect(result.get('0,0')).toEqual({ before: 42, after: DELTA_POINTER_RESULT.SET })
      })

      it('should mark the orphan pointer as CLEARED with the previous deployment id', () => {
        expect(result.get('1,1')).toEqual({ before: 42, after: DELTA_POINTER_RESULT.CLEARED })
      })
    })

    describe('and multiple overwritten deployments overlap on the same orphan pointer', () => {
      let entity: Entity
      let result: PointerDeltaMap

      beforeEach(async () => {
        entity = buildEntity({ pointers: ['0,0'] })
        deploymentsRepository.getDeployments.mockResolvedValueOnce([
          { id: 1, pointers: ['1,1'] },
          { id: 2, pointers: ['1,1'] }
        ])
        result = await referenceEntityFromPointers(deploymentsRepository, database, entity, new Set([1, 2]), false)
      })

      it('should keep the first encountered deployment id as `before` for the orphan pointer', () => {
        expect(result.get('1,1')).toEqual({ before: 1, after: DELTA_POINTER_RESULT.CLEARED })
      })
    })
  })
})
