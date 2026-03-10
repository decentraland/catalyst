import { EntityType } from '@dcl/schemas'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import LeakDetector from 'jest-leak-detector'
import { createDeployRateLimiter } from '../../../../src/ports/deployRateLimiterComponent'
import { makeNoopValidator } from '../../../helpers/service/validations/NoOpValidator'
import { buildDeployData, buildDeployDataAfterEntity } from '../../E2ETestUtils'
import { TestProgram } from '../../TestProgram'
import { createDefaultServer, resetServer } from '../../simpleTestEnvironment'

// Short TTLs for testing (in milliseconds — converted to seconds internally by the rate limiter)
const NORMAL_TTL_MS = 2000
const UNCHANGED_TTL_MS = 5000

describe('Rate limiting E2E', () => {
  let server: TestProgram

  /**
   * Creates a real rate limiter with short TTLs and assigns its methods
   * onto the shared rate limiter object. This works because the deployer
   * captures a reference to the same object via Object.assign in the
   * test environment setup.
   */
  function applyRealRateLimiter() {
    const realRateLimiter = createDeployRateLimiter(
      { logs: server.components.logs },
      {
        defaultTtl: NORMAL_TTL_MS,
        defaultMax: 10000,
        entitiesConfigTtl: new Map([[EntityType.SCENE, NORMAL_TTL_MS]]),
        entitiesConfigMax: new Map(),
        entitiesConfigUnchangedTtl: new Map([[EntityType.SCENE, UNCHANGED_TTL_MS]])
      }
    )
    Object.assign(server.components.deployRateLimiter, realRateLimiter)
  }

  beforeAll(async () => {
    server = await createDefaultServer()
    // Bypass protocol validation (blockchain checks) but keep server
    // validation active — rate limiting is part of server validation
    makeNoopValidator(server.components)
  })

  beforeEach(async () => {
    await resetServer(server)
    // Fresh rate limiter per test so cached entries don't leak across tests
    applyRealRateLimiter()
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it('should reject a deployment to the same pointer within the rate limit TTL', async () => {
    const { deployData: d1 } = await buildDeployData(['X100,Y100', 'X100,Y101'], {
      metadata: { v: 1 }
    })
    await server.deployEntity(d1)

    // Different entity (different metadata → different entity ID) to the same pointers
    const { deployData: d2 } = await buildDeployDataAfterEntity(
      { timestamp: Date.now() },
      ['X100,Y100', 'X100,Y101'],
      { metadata: { v: 2 } }
    )

    await expect(server.deployEntity(d2)).rejects.toThrow(/rate limited/i)
  })

  it('should allow a deployment after the normal rate limit TTL expires', async () => {
    const { deployData: d1 } = await buildDeployData(['X200,Y200'], {
      metadata: { v: 1 }
    })
    const ts1 = await server.deployEntity(d1)

    // Wait for the 2s TTL to expire
    await sleep(NORMAL_TTL_MS + 1000)

    const { deployData: d2 } = await buildDeployDataAfterEntity(
      { timestamp: ts1 },
      ['X200,Y200'],
      { metadata: { v: 2 } }
    )

    // Should succeed — TTL has expired
    const ts2 = await server.deployEntity(d2)
    expect(ts2).toBeGreaterThan(ts1)
  })

  it('should apply a longer rate limit TTL when the same metadata is re-deployed', async () => {
    const metadata = { outfit: 'red-shirt', version: 1 }

    // Deploy 1: initial deployment
    const { deployData: d1 } = await buildDeployData(['X300,Y300'], { metadata })
    const ts1 = await server.deployEntity(d1)

    // Wait for normal TTL (2s) to expire
    await sleep(NORMAL_TTL_MS + 1000)

    // Deploy 2: same metadata → succeeds, but registers in the unchanged cache (5s TTL)
    const { deployData: d2 } = await buildDeployDataAfterEntity(
      { timestamp: ts1 },
      ['X300,Y300'],
      { metadata }
    )
    const ts2 = await server.deployEntity(d2)
    expect(ts2).toBeGreaterThan(ts1)

    // Wait for normal TTL (2s) to expire, but NOT the unchanged TTL (5s)
    await sleep(NORMAL_TTL_MS + 1000)

    // Deploy 3: same metadata again → should be rate-limited by the unchanged cache
    const { deployData: d3 } = await buildDeployDataAfterEntity(
      { timestamp: ts2 },
      ['X300,Y300'],
      { metadata }
    )
    await expect(server.deployEntity(d3)).rejects.toThrow(/rate limited/i)
  })

  it('should allow a deployment with changed metadata even when the unchanged rate limit TTL is active', async () => {
    const metadata = { outfit: 'red-shirt', version: 1 }

    // Deploy 1: initial deployment
    const { deployData: d1 } = await buildDeployData(['X400,Y400'], { metadata })
    const ts1 = await server.deployEntity(d1)

    // Wait for normal TTL to expire
    await sleep(NORMAL_TTL_MS + 1000)

    // Deploy 2: same metadata → sets the unchanged cache (5s TTL)
    const { deployData: d2 } = await buildDeployDataAfterEntity(
      { timestamp: ts1 },
      ['X400,Y400'],
      { metadata }
    )
    const ts2 = await server.deployEntity(d2)

    // Wait for normal TTL to expire, but NOT unchanged TTL
    await sleep(NORMAL_TTL_MS + 1000)

    // Deploy 3: DIFFERENT metadata → unchanged check doesn't apply → should succeed
    const { deployData: d3 } = await buildDeployDataAfterEntity(
      { timestamp: ts2 },
      ['X400,Y400'],
      { metadata: { outfit: 'blue-shirt', version: 2 } }
    )
    const ts3 = await server.deployEntity(d3)
    expect(ts3).toBeGreaterThan(ts2)
  })
})
