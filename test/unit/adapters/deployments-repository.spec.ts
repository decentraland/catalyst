import { EntityType } from '@dcl/schemas'
import { createDeploymentsRepository } from '../../../src/adapters/deployments-repository'
import { IDeploymentsRepository } from '../../../src/adapters/deployments-repository/types'
import { createDatabaseMockedComponent } from '../../mocks/database-component-mock'
import { createMockedEntity } from '../../mocks/entity-mock'

describe('deployments-repository', () => {
  describe('when checking for a newer deployment on the entity pointers', () => {
    let database: ReturnType<typeof createDatabaseMockedComponent>
    let repository: IDeploymentsRepository

    beforeEach(() => {
      database = createDatabaseMockedComponent()
      repository = createDeploymentsRepository()
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    describe('and a newer deployment exists on the pointers', () => {
      let result: boolean

      beforeEach(async () => {
        database.queryWithValues.mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 })
        result = await repository.hasNewerDeploymentOnPointers(database, createMockedEntity())
      })

      it('should return true', () => {
        expect(result).toBe(true)
      })
    })

    describe('and no newer deployment exists on the pointers', () => {
      let result: boolean

      beforeEach(async () => {
        database.queryWithValues.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
        result = await repository.hasNewerDeploymentOnPointers(database, createMockedEntity())
      })

      it('should return false', () => {
        expect(result).toBe(false)
      })
    })

    describe('and the query returns no rows', () => {
      let result: boolean

      beforeEach(async () => {
        database.queryWithValues.mockResolvedValueOnce({ rows: [], rowCount: 0 })
        result = await repository.hasNewerDeploymentOnPointers(database, createMockedEntity())
      })

      it('should default to false instead of throwing on the missing row', () => {
        expect(result).toBe(false)
      })
    })

    describe('and building the query', () => {
      let entity: ReturnType<typeof createMockedEntity>

      beforeEach(async () => {
        entity = createMockedEntity({
          type: EntityType.PROFILE,
          id: 'QmNewer',
          pointers: ['0xAbC'],
          timestamp: 1000
        })
        database.queryWithValues.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
        await repository.hasNewerDeploymentOnPointers(database, entity)
      })

      it('should filter by the entity type', () => {
        const query = database.queryWithValues.mock.calls[0][0]
        expect(query.text).toContain('entity_type =')
        expect(query.values).toContain(EntityType.PROFILE)
      })

      it('should filter by overlapping pointers lowercased', () => {
        const query = database.queryWithValues.mock.calls[0][0]
        expect(query.text).toContain('entity_pointers &&')
        expect(query.values).toContainEqual(['0xabc'])
      })

      it('should compare by timestamp and break ties on LOWER(entity_id)', () => {
        const query = database.queryWithValues.mock.calls[0][0]
        expect(query.text).toContain('entity_timestamp > to_timestamp(')
        expect(query.text).toContain('LOWER(entity_id) > LOWER(')
        expect(query.values).toContain('QmNewer')
      })
    })
  })
})
