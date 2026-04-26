import { Entity, EntityType } from '@dcl/schemas'
import { DeploymentContext } from '../../../src/deployment-types'
import { createServerValidator, IGNORING_FIX_ERROR } from '../../../src/logic/server-validator'

describe('createServerValidator', () => {
  describe('when the context is FIX_ATTEMPT', () => {
    let entity: Entity

    beforeEach(() => {
      entity = {
        version: 'v3',
        id: 'entity-id',
        type: EntityType.SCENE,
        pointers: ['0,0'],
        timestamp: Date.now(),
        content: [],
        metadata: {}
      }
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    describe('and the entity is not a failed deployment', () => {
      let result: { ok: boolean; message?: string }

      beforeEach(async () => {
        const validator = createServerValidator({
          failedDeployments: {
            removeFailedDeployment: jest.fn()
          } as any,
        })

        result = await validator.validate(entity, DeploymentContext.FIX_ATTEMPT, {
          areThereNewerEntities: jest.fn().mockResolvedValueOnce(false),
          isEntityDeployedAlready: jest.fn().mockResolvedValueOnce(false),
          isNotFailedDeployment: jest.fn().mockResolvedValueOnce(true),
          isEntityRateLimited: jest.fn().mockResolvedValueOnce(false),
          isRequestTtlBackwards: jest.fn().mockResolvedValueOnce(false)
        })
      })

      it('should return an error indicating the entity is not marked as failed', () => {
        expect(result).toEqual({
          ok: false,
          message: 'You are trying to fix an entity that is not marked as failed'
        })
      })
    })

    describe('and the entity is a failed deployment', () => {
      let result: { ok: boolean; message?: string }

      beforeEach(async () => {
        const validator = createServerValidator({
          failedDeployments: {
            removeFailedDeployment: jest.fn()
          } as any,
        })

        result = await validator.validate(entity, DeploymentContext.FIX_ATTEMPT, {
          areThereNewerEntities: jest.fn().mockResolvedValueOnce(false),
          isEntityDeployedAlready: jest.fn().mockResolvedValueOnce(false),
          isNotFailedDeployment: jest.fn().mockResolvedValueOnce(false),
          isEntityRateLimited: jest.fn().mockResolvedValueOnce(false),
          isRequestTtlBackwards: jest.fn().mockResolvedValueOnce(false)
        })
      })

      it('should allow the deployment', () => {
        expect(result).toEqual({ ok: true })
      })
    })

    describe('and isNotFailedDeployment is an async function that resolves to true', () => {
      let result: { ok: boolean; message?: string }

      beforeEach(async () => {
        const validator = createServerValidator({
          failedDeployments: {
            removeFailedDeployment: jest.fn()
          } as any,
        })

        result = await validator.validate(entity, DeploymentContext.FIX_ATTEMPT, {
          areThereNewerEntities: jest.fn().mockResolvedValueOnce(false),
          isEntityDeployedAlready: jest.fn().mockResolvedValueOnce(false),
          isNotFailedDeployment: async () => true,
          isEntityRateLimited: jest.fn().mockResolvedValueOnce(false),
          isRequestTtlBackwards: jest.fn().mockResolvedValueOnce(false)
        })
      })

      it('should correctly reject the deployment', () => {
        expect(result).toEqual({
          ok: false,
          message: 'You are trying to fix an entity that is not marked as failed'
        })
      })
    })

    describe('and there are newer entities', () => {
      let result: { ok: boolean; message?: string }
      let removeFailedDeployment: jest.Mock

      beforeEach(async () => {
        removeFailedDeployment = jest.fn().mockResolvedValueOnce(undefined)
        const validator = createServerValidator({
          failedDeployments: {
            removeFailedDeployment
          } as any,
        })

        result = await validator.validate(entity, DeploymentContext.FIX_ATTEMPT, {
          areThereNewerEntities: jest.fn().mockResolvedValueOnce(true),
          isEntityDeployedAlready: jest.fn().mockResolvedValueOnce(false),
          isNotFailedDeployment: jest.fn().mockResolvedValueOnce(true),
          isEntityRateLimited: jest.fn().mockResolvedValueOnce(false),
          isRequestTtlBackwards: jest.fn().mockResolvedValueOnce(false)
        })
      })

      it('should remove the failed deployment and return an error', () => {
        expect(removeFailedDeployment).toHaveBeenCalledWith(entity.id)
        expect(result).toEqual({
          ok: false,
          message: expect.stringContaining(IGNORING_FIX_ERROR)
        })
      })
    })
  })
})
