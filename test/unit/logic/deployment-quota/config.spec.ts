import { EntityType } from '@dcl/schemas'
import {
  DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_DAY,
  DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_HOUR,
  DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_MINUTE,
  DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_WEEK,
  Environment,
  EnvironmentBuilder,
  EnvironmentConfig
} from '../../../../src/Environment'

describe('when reading the deployment quota configuration', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = process.env
    process.env = { ...originalEnv }
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('DEPLOYMENT_QUOTA_')) {
        delete process.env[name]
      }
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('and nothing is set', () => {
    let env: Environment

    beforeEach(async () => {
      env = await new EnvironmentBuilder().build()
    })

    it('should install the default ladder so the server runs unconfigured', () => {
      expect([
        env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE),
        env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_HOUR),
        env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_DAY),
        env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_WEEK)
      ]).toEqual([
        DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_MINUTE,
        DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_HOUR,
        DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_DAY,
        DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_WEEK
      ])
    })

    it('should leave the default ladder monotonic, so no window is unreachable', () => {
      expect([
        DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_MINUTE <= DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_HOUR,
        DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_HOUR <= DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_DAY,
        DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_DAY <= DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_WEEK
      ]).toEqual([true, true, true])
    })

    it('should exempt no address', () => {
      expect(env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_EXEMPT_IPS)).toEqual([])
    })

    it('should leave every window without per-entity-type overrides', () => {
      expect(env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_HOUR_BY_ENTITY_TYPE)).toEqual(new Map())
    })
  })

  describe('and a window budget is set', () => {
    let env: Environment

    beforeEach(async () => {
      process.env.DEPLOYMENT_QUOTA_MAX_PER_MINUTE = '5'
      env = await new EnvironmentBuilder().build()
    })

    it('should read it from the environment', () => {
      expect(env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE)).toBe(5)
    })
  })

  describe('and a per-entity-type override is set', () => {
    let env: Environment

    beforeEach(async () => {
      process.env.DEPLOYMENT_QUOTA_MAX_PER_HOUR_SCENE = '20'
      process.env.DEPLOYMENT_QUOTA_MAX_PER_HOUR_OUTFITS = '40'
      env = await new EnvironmentBuilder().build()
    })

    it('should collect it under the window it belongs to', () => {
      expect(env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_HOUR_BY_ENTITY_TYPE)).toEqual(
        new Map([
          [EntityType.SCENE, 20],
          [EntityType.OUTFITS, 40]
        ])
      )
    })

    it('should not let it leak into another window', () => {
      expect(env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_DAY_BY_ENTITY_TYPE)).toEqual(new Map())
    })

    it("should leave the window's own budget untouched", () => {
      expect(env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_HOUR)).toBe(DEFAULT_DEPLOYMENT_QUOTA_MAX_PER_HOUR)
    })
  })

  describe('and a window budget is set to zero', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_QUOTA_MAX_PER_DAY = '0'
    })

    it('should fail at startup rather than install a quota that rejects every deployment', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid DEPLOYMENT_QUOTA_MAX_PER_DAY')
    })
  })

  describe('and a window budget is not a number', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_QUOTA_MAX_PER_WEEK = '10k'
    })

    it('should fail at startup rather than silently truncate the value', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid DEPLOYMENT_QUOTA_MAX_PER_WEEK')
    })
  })

  describe('and a per-entity-type override is set to zero', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_QUOTA_MAX_PER_MINUTE_SCENE = '0'
    })

    it('should fail at startup rather than block every scene deployment', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid DEPLOYMENT_QUOTA_MAX_PER_MINUTE_SCENE')
    })
  })

  describe('and a per-entity-type override names something that is not an entity type', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_QUOTA_MAX_PER_MINUTE_SCENES = '20'
    })

    it('should fail at startup rather than record an override nothing will ever read', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow(
        'Invalid DEPLOYMENT_QUOTA_MAX_PER_MINUTE_SCENES: "SCENES" is not an entity type'
      )
    })
  })

  describe('and the exempt address list is set', () => {
    let env: Environment

    beforeEach(async () => {
      process.env.DEPLOYMENT_QUOTA_EXEMPT_IPS = ' 203.0.113.7 , 198.51.100.0/24 ,, '
      env = await new EnvironmentBuilder().build()
    })

    it('should split it, trimming each entry and dropping the empty ones', () => {
      expect(env.getConfig(EnvironmentConfig.DEPLOYMENT_QUOTA_EXEMPT_IPS)).toEqual(['203.0.113.7', '198.51.100.0/24'])
    })
  })

  describe('and the counter cache size is set to zero', () => {
    beforeEach(() => {
      process.env.DEPLOYMENT_QUOTA_CACHE_MAX_KEYS = '0'
    })

    it('should fail at startup rather than build a cache that holds no counters', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid DEPLOYMENT_QUOTA_CACHE_MAX_KEYS')
    })
  })
})
