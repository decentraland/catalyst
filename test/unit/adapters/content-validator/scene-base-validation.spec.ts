import { EntityType } from '@dcl/schemas'
import { DeploymentToValidate, OK, ValidateFn } from '@dcl/content-validator'
import { createSceneBaseAwareAccessValidateFn } from '../../../../src/adapters/content-validator/scene-base-validation'

describe('when validating scene access with a base-aware validator', () => {
  let accessValidateFn: jest.MockedFunction<ValidateFn>
  let validate: ValidateFn
  let deployment: DeploymentToValidate

  beforeEach(() => {
    accessValidateFn = jest.fn().mockResolvedValue(OK)
    validate = createSceneBaseAwareAccessValidateFn(accessValidateFn)
    deployment = {
      entity: {
        id: 'entity-id',
        version: 'v3',
        type: EntityType.SCENE,
        pointers: ['1,1'],
        timestamp: Date.now(),
        content: [],
        metadata: {
          main: 'bin/game.js',
          scene: { base: '1,1', parcels: ['1,1'] }
        }
      },
      files: new Map(),
      auditInfo: { authChain: [] }
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the base belongs to the pointers and scene parcels', () => {
    it('should delegate to the configured access validator', async () => {
      await validate(deployment)

      expect(accessValidateFn).toHaveBeenCalledWith(deployment)
    })
  })

  describe('and the pointers and scene parcels contain the same parcels in a different order', () => {
    beforeEach(() => {
      deployment.entity.pointers = ['1,2', '1,1']
      deployment.entity.metadata.scene = { base: '1,1', parcels: ['1,1', '1,2'] }
    })

    it('should delegate to the configured access validator', async () => {
      await validate(deployment)

      expect(accessValidateFn).toHaveBeenCalledWith(deployment)
    })
  })

  describe('and the base does not belong to the pointers or scene parcels', () => {
    beforeEach(() => {
      deployment.entity.metadata.scene.base = '2,2'
    })

    it('should reject the deployment', async () => {
      const result = await validate(deployment)

      expect(result.ok).toBe(false)
    })

    it('should not invoke the configured access validator', async () => {
      await validate(deployment)

      expect(accessValidateFn).not.toHaveBeenCalled()
    })
  })

  describe('and the scene parcels contain a parcel that is not authorized by the pointers', () => {
    beforeEach(() => {
      deployment.entity.metadata.scene.parcels = ['1,1', '2,2']
    })

    it('should reject the deployment', async () => {
      const result = await validate(deployment)

      expect(result.ok).toBe(false)
    })
  })

  describe('and a pointer is a non-canonical alias of the scene parcel', () => {
    beforeEach(() => {
      deployment.entity.pointers = ['01,1']
    })

    it('should reject the deployment', async () => {
      const result = await validate(deployment)

      expect(result.ok).toBe(false)
    })
  })

  describe('and more than one thousand unique canonical parcels match the pointers', () => {
    beforeEach(() => {
      const parcels = Array.from({ length: 1001 }, (_, index) => `${index},0`)
      deployment.entity.pointers = parcels
      deployment.entity.metadata.scene = { base: '0,0', parcels }
    })

    it('should delegate platform-specific parcel limits to the configured validator', async () => {
      await validate(deployment)

      expect(accessValidateFn).toHaveBeenCalledWith(deployment)
    })
  })
})
