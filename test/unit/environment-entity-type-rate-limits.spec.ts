import { EntityType } from '@dcl/schemas'
import { Environment, EnvironmentBuilder, EnvironmentConfig } from '../../src/Environment'

describe('when reading the per entity type deployment rate limit configuration', () => {
  let originalEnv: NodeJS.ProcessEnv
  let warnSpy: jest.SpyInstance
  let env: Environment
  let maxConfig: Map<EntityType, number>
  let ttlConfig: Map<EntityType, number>

  beforeEach(() => {
    originalEnv = process.env
    process.env = { ...originalEnv }
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.env = originalEnv
    warnSpy.mockRestore()
  })

  describe('and the suffixes are entity types', () => {
    beforeEach(async () => {
      process.env.DEPLOYMENT_RATE_LIMIT_MAX_PROFILE = '300'
      process.env.DEPLOYMENT_RATE_LIMIT_MAX_OUTFITS = '50'
      process.env.DEPLOYMENT_RATE_LIMIT_TTL_SCENES = '2m'
      env = await new EnvironmentBuilder().build()
      maxConfig = env.getConfig(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_MAX)
      ttlConfig = env.getConfig(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_TTL)
    })

    it('should key the max limits by entity type', () => {
      expect(maxConfig).toEqual(
        new Map([
          [EntityType.PROFILE, 300],
          [EntityType.OUTFITS, 50]
        ])
      )
    })

    it('should key the TTLs by entity type', () => {
      expect(ttlConfig).toEqual(new Map([[EntityType.SCENE, 120000]]))
    })

    it('should not warn', () => {
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })

  describe('and a suffix is not an entity type', () => {
    beforeEach(async () => {
      process.env.DEPLOYMENT_RATE_LIMIT_MAX_PROFILE = '300'
      process.env.DEPLOYMENT_RATE_LIMIT_MAX_PROFILEZ = '10'
      process.env.DEPLOYMENT_RATE_LIMIT_TTL_OUTFIT = '1m'
      env = await new EnvironmentBuilder().build()
      maxConfig = env.getConfig(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_MAX)
      ttlConfig = env.getConfig(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_TTL)
    })

    it('should skip the unknown max limit and keep the valid ones', () => {
      expect(maxConfig).toEqual(new Map([[EntityType.PROFILE, 300]]))
    })

    it('should skip the unknown TTL', () => {
      expect(ttlConfig).toEqual(new Map())
    })

    it('should warn about each skipped variable', () => {
      expect(warnSpy.mock.calls).toEqual([
        [expect.stringContaining('DEPLOYMENT_RATE_LIMIT_MAX_PROFILEZ')],
        [expect.stringContaining('DEPLOYMENT_RATE_LIMIT_TTL_OUTFIT')]
      ])
    })
  })
})
