import { PointerUsage } from '../../../src/adapters/pending-deployments-repository'
import { Environment, EnvironmentBuilder, EnvironmentConfig } from '../../../src/Environment'
import { checkPointerQuotas, PointerQuotaRejection } from '../../../src/logic/partial-deployments/component'

const NOW = 1_800_000_000_000
const TTL_MS = 60 * 60 * 1000
const MINUTE = 60 * 1000

function usageOf(pointer: string, uploads: number, deployerUploads: number, oldestAgoMs: number): PointerUsage {
  return {
    pointer,
    uploads,
    deployerUploads,
    oldestCreatedAt: NOW - oldestAgoMs,
    deployerOldestCreatedAt: deployerUploads > 0 ? NOW - oldestAgoMs : undefined
  }
}

describe('when checking a new partial upload against the per-pointer caps', () => {
  let usage: PointerUsage[]
  let maxUploadsPerPointer: number
  let rejection: PointerQuotaRejection | undefined

  function check() {
    return checkPointerQuotas({ usage, maxUploadsPerPointer, now: NOW, ttlMs: TTL_MS })
  }

  beforeEach(() => {
    maxUploadsPerPointer = 4
  })

  describe('and no live upload holds any of its pointers', () => {
    beforeEach(() => {
      usage = []
      rejection = check()
    })

    it('should admit it', () => {
      expect(rejection).toBeUndefined()
    })
  })

  describe('and its pointers hold one upload less than the cap, none of the deployer', () => {
    beforeEach(() => {
      usage = [usageOf('0,0', 3, 0, 10 * MINUTE), usageOf('0,1', 1, 0, 5 * MINUTE)]
      rejection = check()
    })

    it('should admit it', () => {
      expect(rejection).toBeUndefined()
    })
  })

  describe('and one of its pointers holds the cap across deployers', () => {
    beforeEach(() => {
      usage = [usageOf('0,0', 2, 1, 50 * MINUTE), usageOf('0,1', 4, 0, 20 * MINUTE)]
      rejection = check()
    })

    it('should reject it as over the per-pointer cap, naming the full parcel', () => {
      expect(rejection).toEqual({
        reason: 'uploads_per_pointer',
        message:
          'Too many partial uploads in progress for parcels 0,1 (max 4 per parcel). Complete an upload or wait for one to expire.',
        retryAfterSeconds: 40 * 60
      })
    })
  })

  describe('and several of its pointers hold the cap', () => {
    beforeEach(() => {
      usage = [usageOf('0,0', 4, 0, 50 * MINUTE), usageOf('0,1', 5, 0, 20 * MINUTE)]
      rejection = check()
    })

    it('should ask the client to retry once every full pointer has freed a slot', () => {
      expect(rejection?.retryAfterSeconds).toBe(40 * 60)
    })
  })

  describe('and more than five of its pointers hold the cap', () => {
    beforeEach(() => {
      usage = ['0,0', '0,1', '0,2', '0,3', '0,4', '0,5', '0,6'].map((pointer) => usageOf(pointer, 4, 0, MINUTE))
      rejection = check()
    })

    it('should name the first five and count the rest', () => {
      expect(rejection?.message).toContain('parcels 0,0 0,1 0,2 0,3 0,4 and 2 more (max 4 per parcel)')
    })
  })

  describe('and the oldest upload holding a full pointer expired while the check ran', () => {
    beforeEach(() => {
      usage = [usageOf('0,0', 4, 0, TTL_MS + 1000)]
      rejection = check()
    })

    it('should still ask for at least one second', () => {
      expect(rejection?.retryAfterSeconds).toBe(1)
    })
  })

  describe('and the deployer holds all but one of the uploads on one of its pointers', () => {
    beforeEach(() => {
      usage = [usageOf('0,0', 3, 3, 30 * MINUTE)]
      rejection = check()
    })

    it("should reject it as over the deployer's share of the pointer", () => {
      expect(rejection).toEqual({
        reason: 'uploads_per_pointer_account',
        message:
          'Too many partial uploads in progress for this account on parcels 0,0 (max 3 per parcel). Complete an upload or wait for one to expire.',
        retryAfterSeconds: 30 * 60
      })
    })
  })

  describe("and the deployer's oldest upload on the pointer is newer than other deployers' ones", () => {
    beforeEach(() => {
      usage = [{ ...usageOf('0,0', 3, 3, 50 * MINUTE), deployerOldestCreatedAt: NOW - 15 * MINUTE }]
      rejection = check()
    })

    it("should time the retry by the deployer's oldest upload on it", () => {
      expect(rejection?.retryAfterSeconds).toBe(45 * 60)
    })
  })

  describe('and the cap is one', () => {
    beforeEach(() => {
      maxUploadsPerPointer = 1
    })

    describe('and no upload holds its pointers', () => {
      beforeEach(() => {
        usage = []
        rejection = check()
      })

      it('should still let the deployer hold one upload', () => {
        expect(rejection).toBeUndefined()
      })
    })

    describe('and the deployer already holds the pointer', () => {
      beforeEach(() => {
        usage = [usageOf('0,0', 1, 1, MINUTE)]
        rejection = check()
      })

      it('should reject it as over the per-pointer cap', () => {
        expect(rejection?.reason).toBe('uploads_per_pointer')
      })
    })
  })
})

describe('when reading the per-pointer partial upload cap configuration', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = process.env
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('and it is not set', () => {
    let env: Environment

    beforeEach(async () => {
      delete process.env.MAX_PENDING_UPLOADS_PER_POINTER
      env = await new EnvironmentBuilder().build()
    })

    it('should allow four live uploads per parcel', () => {
      expect(env.getConfig(EnvironmentConfig.MAX_PENDING_UPLOADS_PER_POINTER)).toBe(4)
    })
  })

  describe('and it is set', () => {
    let env: Environment

    beforeEach(async () => {
      process.env.MAX_PENDING_UPLOADS_PER_POINTER = '7'
      env = await new EnvironmentBuilder().build()
    })

    it('should read it from the environment', () => {
      expect(env.getConfig(EnvironmentConfig.MAX_PENDING_UPLOADS_PER_POINTER)).toBe(7)
    })
  })

  describe('and it is set to zero', () => {
    beforeEach(() => {
      process.env.MAX_PENDING_UPLOADS_PER_POINTER = '0'
    })

    it('should fail at startup rather than reject every partial upload', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid MAX_PENDING_UPLOADS_PER_POINTER')
    })
  })

  describe('and it is not a number', () => {
    beforeEach(() => {
      process.env.MAX_PENDING_UPLOADS_PER_POINTER = 'four'
    })

    it('should fail at startup rather than silently fall back', async () => {
      await expect(new EnvironmentBuilder().build()).rejects.toThrow('Invalid MAX_PENDING_UPLOADS_PER_POINTER')
    })
  })
})
