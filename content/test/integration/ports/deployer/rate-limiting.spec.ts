import { EntityType } from '@dcl/schemas'
import LeakDetector from 'jest-leak-detector'
import { DeploymentContext } from '../../../../src/deployment-types'
import { createDeployRateLimiter } from '../../../../src/ports/deployRateLimiterComponent'
import { makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { buildDeployData, buildDeployDataAfterEntity, EntityCombo } from '../../E2ETestUtils'
import { TestProgram } from '../../TestProgram'
import { createDefaultServer, resetServer } from '../../simpleTestEnvironment'

// Short TTLs for testing (in milliseconds)
const NORMAL_TTL_MS = 2000
const UNCHANGED_TTL_MS = 5000

describe('Rate limiting E2E', () => {
  let server: TestProgram
  let currentTime: number
  let dateNowSpy: jest.SpyInstance

  /**
   * Advances the mocked Date.now() by the given milliseconds.
   * NodeCache and the deployer's Clock component both rely on Date.now(),
   * so this controls TTL expiration without real sleeps.
   */
  function advanceTime(ms: number): void {
    currentTime += ms
  }

  /**
   * Creates a real rate limiter with short TTLs and assigns its methods
   * onto the shared rate limiter object. This works because the deployer
   * captures a reference to the same object via Object.assign in the
   * test environment setup.
   */
  function applyRealRateLimiter(): void {
    const realRateLimiter = createDeployRateLimiter(
      { logs: server.components.logs, metrics: server.components.metrics },
      {
        defaultTtl: NORMAL_TTL_MS,
        defaultMax: 10000,
        entitiesConfigTtl: new Map([
          [EntityType.SCENE, NORMAL_TTL_MS],
          [EntityType.PROFILE, NORMAL_TTL_MS],
          [EntityType.WEARABLE, NORMAL_TTL_MS],
          [EntityType.STORE, NORMAL_TTL_MS],
          [EntityType.EMOTE, NORMAL_TTL_MS],
          [EntityType.OUTFITS, NORMAL_TTL_MS]
        ]),
        entitiesConfigMax: new Map(),
        entitiesConfigUnchangedTtl: new Map([[EntityType.PROFILE, UNCHANGED_TTL_MS]])
      }
    )
    Object.assign(server.components.deployRateLimiter, realRateLimiter)
  }

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  beforeEach(async () => {
    currentTime = Date.now()
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime)
    await resetServer(server)
    applyRealRateLimiter()
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  describe('when deploying to the same pointer within the normal TTL', () => {
    let firstDeploy: EntityCombo
    let secondDeploy: EntityCombo

    beforeEach(async () => {
      firstDeploy = await buildDeployData(['X100,Y100', 'X100,Y101'], {
        metadata: { v: 1 }
      })
      await server.deployEntity(firstDeploy.deployData)

      secondDeploy = await buildDeployDataAfterEntity(
        { timestamp: currentTime },
        ['X100,Y100', 'X100,Y101'],
        { metadata: { v: 2 } }
      )
    })

    it('should reject the deployment', async () => {
      await expect(server.deployEntity(secondDeploy.deployData)).rejects.toThrow(/rate limited/i)
    })
  })

  describe('when deploying after the normal TTL has expired', () => {
    let firstTimestamp: number
    let secondDeploy: EntityCombo

    beforeEach(async () => {
      const { deployData: d1 } = await buildDeployData(['X200,Y200'], {
        metadata: { v: 1 }
      })
      firstTimestamp = await server.deployEntity(d1)

      advanceTime(NORMAL_TTL_MS + 1000)

      secondDeploy = await buildDeployDataAfterEntity(
        { timestamp: firstTimestamp },
        ['X200,Y200'],
        { metadata: { v: 2 } }
      )
    })

    it('should allow the deployment', async () => {
      const secondTimestamp: number = await server.deployEntity(secondDeploy.deployData)
      expect(secondTimestamp).toBeGreaterThan(firstTimestamp)
    })
  })

  describe('when re-deploying a profile with the same metadata (unchanged content)', () => {
    const metadata = { avatar: { snapshots: {} }, version: 1 }
    let secondTimestamp: number

    beforeEach(async () => {
      const { deployData: d1 } = await buildDeployData(['0xAddress300'], {
        type: EntityType.PROFILE,
        metadata
      })
      const firstTimestamp: number = await server.deployEntity(d1)

      advanceTime(NORMAL_TTL_MS + 1000)

      const { deployData: d2 } = await buildDeployDataAfterEntity(
        { timestamp: firstTimestamp },
        ['0xAddress300'],
        { type: EntityType.PROFILE, metadata }
      )
      secondTimestamp = await server.deployEntity(d2)
    })

    describe('and the normal TTL has expired but the unchanged TTL has not', () => {
      let thirdDeploy: EntityCombo

      beforeEach(async () => {
        advanceTime(NORMAL_TTL_MS + 1000)

        thirdDeploy = await buildDeployDataAfterEntity(
          { timestamp: secondTimestamp },
          ['0xAddress300'],
          { type: EntityType.PROFILE, metadata }
        )
      })

      it('should reject the deployment', async () => {
        await expect(server.deployEntity(thirdDeploy.deployData)).rejects.toThrow(/rate limited/i)
      })
    })
  })

  describe('when the unchanged TTL is active for a profile from a previous identical deployment', () => {
    const metadata = { avatar: { snapshots: {} }, version: 1 }
    let secondTimestamp: number

    beforeEach(async () => {
      const { deployData: d1 } = await buildDeployData(['0xAddress400'], {
        type: EntityType.PROFILE,
        metadata
      })
      const firstTimestamp: number = await server.deployEntity(d1)

      advanceTime(NORMAL_TTL_MS + 1000)

      const { deployData: d2 } = await buildDeployDataAfterEntity(
        { timestamp: firstTimestamp },
        ['0xAddress400'],
        { type: EntityType.PROFILE, metadata }
      )
      secondTimestamp = await server.deployEntity(d2)

      advanceTime(NORMAL_TTL_MS + 1000)
    })

    describe('and the new deployment has different metadata', () => {
      let thirdDeploy: EntityCombo

      beforeEach(async () => {
        thirdDeploy = await buildDeployDataAfterEntity(
          { timestamp: secondTimestamp },
          ['0xAddress400'],
          { type: EntityType.PROFILE, metadata: { avatar: { snapshots: {} }, version: 2 } }
        )
      })

      it('should allow the deployment', async () => {
        const thirdTimestamp: number = await server.deployEntity(thirdDeploy.deployData)
        expect(thirdTimestamp).toBeGreaterThan(secondTimestamp)
      })
    })
  })

  describe('when re-deploying a scene with the same metadata (unchanged content)', () => {
    const metadata = { scene: 'genesis-plaza', version: 1 }
    let secondDeploy: EntityCombo

    beforeEach(async () => {
      const { deployData: d1 } = await buildDeployData(['X900,Y900'], { metadata })
      const firstTimestamp: number = await server.deployEntity(d1)

      advanceTime(NORMAL_TTL_MS + 1000)

      secondDeploy = await buildDeployDataAfterEntity(
        { timestamp: firstTimestamp },
        ['X900,Y900'],
        { metadata }
      )
    })

    it('should allow the unchanged scene deployment without applying unchanged rate limiting', async () => {
      const secondTimestamp: number = await server.deployEntity(secondDeploy.deployData)
      expect(secondTimestamp).toBeGreaterThan(0)
    })
  })

  describe('when a synced deployment arrives before a local deployment', () => {
    let syncedEntity: EntityCombo
    let localEntity: EntityCombo

    beforeEach(async () => {
      syncedEntity = await buildDeployData(['X500,Y500', 'X500,Y501'], {
        metadata: { v: 1 }
      })

      await server.components.deployer.deployEntity(
        Array.from(syncedEntity.deployData.files.values()),
        syncedEntity.deployData.entityId,
        { authChain: syncedEntity.deployData.authChain },
        DeploymentContext.SYNCED
      )

      localEntity = await buildDeployDataAfterEntity(
        { timestamp: currentTime },
        ['X500,Y500', 'X500,Y501'],
        { metadata: { v: 2 } }
      )
    })

    it('should allow the local deployment on the same pointers', async () => {
      const localTimestamp: number = await server.deployEntity(localEntity.deployData)
      expect(localTimestamp).toBeGreaterThan(0)
    })
  })

  describe('when a fix-attempt deployment arrives before a local deployment', () => {
    let fixEntity: EntityCombo
    let localEntity: EntityCombo

    beforeEach(async () => {
      fixEntity = await buildDeployData(['X600,Y600', 'X600,Y601'], {
        metadata: { v: 1 }
      })

      await server.components.deployer.deployEntity(
        Array.from(fixEntity.deployData.files.values()),
        fixEntity.deployData.entityId,
        { authChain: fixEntity.deployData.authChain },
        DeploymentContext.FIX_ATTEMPT
      )

      localEntity = await buildDeployDataAfterEntity(
        { timestamp: currentTime },
        ['X600,Y600', 'X600,Y601'],
        { metadata: { v: 2 } }
      )
    })

    it('should allow the local deployment on the same pointers', async () => {
      const localTimestamp: number = await server.deployEntity(localEntity.deployData)
      expect(localTimestamp).toBeGreaterThan(0)
    })
  })

  describe('when multiple synced deployments arrive to the same pointer', () => {
    let localEntity: EntityCombo

    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        const syncedEntity: EntityCombo = await buildDeployData(['X700,Y700'], {
          metadata: { v: i },
          timestamp: currentTime + i
        })
        await server.components.deployer.deployEntity(
          Array.from(syncedEntity.deployData.files.values()),
          syncedEntity.deployData.entityId,
          { authChain: syncedEntity.deployData.authChain },
          DeploymentContext.SYNCED
        )
      }

      localEntity = await buildDeployDataAfterEntity(
        { timestamp: currentTime + 10 },
        ['X700,Y700'],
        { metadata: { v: 'local' } }
      )
    })

    it('should allow the local deployment on the same pointer', async () => {
      const localTimestamp: number = await server.deployEntity(localEntity.deployData)
      expect(localTimestamp).toBeGreaterThan(0)
    })
  })
})
