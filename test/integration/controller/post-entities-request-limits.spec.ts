import FormData from 'form-data'
import { IdentityType } from '@dcl/crypto'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import { createIdentity } from '../E2ETestUtils'
import { buildPartialForm, PreparedDeployment, prepareSceneDeployment } from '../../helpers/partial-deployments'

const BURST_LIMIT = 3
const DAILY_QUOTA = 2
const CLIENT_IP_HEADER = 'x-test-client-ip'

function uniqueContents(count: number): Record<string, Buffer> {
  // Storage is content-addressed and survives resetServer, so each run needs unique bytes.
  const nonce = `${Date.now()}-${Math.random()}`
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`file-${i}.txt`, Buffer.from(`content ${i} ${nonce}`)])
  )
}

describe('Integration - POST /entities request limits', () => {
  let server: TestProgram
  let identity: IdentityType

  // Each case posts from its own client IP, so the per-IP buckets don't leak between cases.
  async function postFrom(clientIp: string, form: FormData, query = ''): Promise<number> {
    const response = await fetch(`${server.getUrl()}/entities${query}`, {
      method: 'POST',
      body: form.getBuffer(),
      headers: { ...form.getHeaders(), [CLIENT_IP_HEADER]: clientIp }
    })
    return response.status
  }

  async function exhaustDailyQuota(clientIp: string, firstParcel: number): Promise<number[]> {
    const statuses: number[] = []
    for (let i = 0; i < DAILY_QUOTA; i++) {
      const deployment = await prepareSceneDeployment([`${firstParcel + i},40`], uniqueContents(1), identity)
      const keys = [deployment.entityId, ...deployment.contentHashes]
      statuses.push(await postFrom(clientIp, buildPartialForm(deployment, keys, false)))
    }
    return statuses
  }

  function partialBatches(deployment: PreparedDeployment): string[][] {
    const [firstHash, ...otherHashes] = deployment.contentHashes
    return [[deployment.entityId, firstHash], ...otherHashes.map((hash) => [hash])]
  }

  beforeAll(async () => {
    server = await createDefaultServer({
      [EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_MAX]: BURST_LIMIT,
      [EnvironmentConfig.POST_ENTITIES_DAILY_QUOTA_MAX]: DAILY_QUOTA,
      [EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER]: CLIENT_IP_HEADER
    })
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await server.stopProgram()
    server = null as any
  })

  beforeEach(async () => {
    await resetServer(server)
    makeNoopValidator(server.components)
    identity = createIdentity()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when a partial upload sends more batches than the per-IP daily quota', () => {
    let statuses: number[]

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(['10,10'], uniqueContents(DAILY_QUOTA + 1), identity)
      statuses = []
      for (const keys of partialBatches(deployment)) {
        statuses.push(await postFrom('203.0.113.1', buildPartialForm(deployment, keys)))
      }
    })

    it('should accept every batch and publish on the last one', () => {
      expect(statuses).toEqual([...Array(DAILY_QUOTA).fill(202), 200])
    })
  })

  describe('when regular deployments exceed the per-IP daily quota', () => {
    let statuses: number[]

    beforeEach(async () => {
      statuses = []
      for (let i = 0; i <= DAILY_QUOTA; i++) {
        const deployment = await prepareSceneDeployment([`${20 + i},20`], uniqueContents(1), identity)
        const keys = [deployment.entityId, ...deployment.contentHashes]
        statuses.push(await postFrom('203.0.113.2', buildPartialForm(deployment, keys, false)))
      }
    })

    it('should rate limit the deployment past the quota', () => {
      expect(statuses).toEqual([...Array(DAILY_QUOTA).fill(200), 429])
    })
  })

  describe('when a partial upload sends more batches than the per-IP burst limit', () => {
    let statuses: number[]

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(['30,30'], uniqueContents(BURST_LIMIT + 1), identity)
      statuses = []
      for (const keys of partialBatches(deployment)) {
        statuses.push(await postFrom('203.0.113.3', buildPartialForm(deployment, keys)))
      }
    })

    it('should rate limit the batch past the limit before reading it', () => {
      expect(statuses).toEqual([...Array(BURST_LIMIT).fill(202), 429])
    })
  })

  describe('when a source has spent its daily quota', () => {
    let exhausting: number[]
    let acquire: jest.SpyInstance
    let status: number

    describe('and it sends another regular deployment', () => {
      beforeEach(async () => {
        exhausting = await exhaustDailyQuota('203.0.113.4', 40)
        acquire = jest.spyOn(server.components.uploadBudget, 'acquire')
        const deployment = await prepareSceneDeployment(['44,40'], uniqueContents(1), identity)
        const keys = [deployment.entityId, ...deployment.contentHashes]
        status = await postFrom('203.0.113.4', buildPartialForm(deployment, keys, false))
      })

      it('should rate limit it before its body is read', () => {
        expect({ exhausting, status, bodiesRead: acquire.mock.calls.length }).toEqual({
          exhausting: [200, 200],
          status: 429,
          bodiesRead: 0
        })
      })
    })

    describe('and it sends a partial batch declared with the partial query parameter', () => {
      beforeEach(async () => {
        exhausting = await exhaustDailyQuota('203.0.113.5', 50)
        const deployment = await prepareSceneDeployment(['54,50'], uniqueContents(1), identity)
        const keys = [deployment.entityId, ...deployment.contentHashes]
        status = await postFrom('203.0.113.5', buildPartialForm(deployment, keys), '?partial=true')
      })

      it('should accept it', () => {
        expect({ exhausting, status }).toEqual({ exhausting: [200, 200], status: 200 })
      })
    })

    describe('and it sends a partial batch that only the form marks as partial', () => {
      beforeEach(async () => {
        exhausting = await exhaustDailyQuota('203.0.113.6', 60)
        acquire = jest.spyOn(server.components.uploadBudget, 'acquire')
        const deployment = await prepareSceneDeployment(['64,60'], uniqueContents(1), identity)
        const keys = [deployment.entityId, ...deployment.contentHashes]
        status = await postFrom('203.0.113.6', buildPartialForm(deployment, keys))
      })

      it('should rate limit it before its body is read', () => {
        expect({ exhausting, status, bodiesRead: acquire.mock.calls.length }).toEqual({
          exhausting: [200, 200],
          status: 429,
          bodiesRead: 0
        })
      })
    })
  })

  describe('when a request declares the partial query parameter but its form is not partial', () => {
    let status: number
    let deployed: boolean

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(['70,70'], uniqueContents(1), identity)
      const keys = [deployment.entityId, ...deployment.contentHashes]
      status = await postFrom('203.0.113.7', buildPartialForm(deployment, keys, false), '?partial=true')
      deployed = (await server.components.deployer.getDeployedEntityTimestamp(deployment.entityId)) !== undefined
    })

    it('should reject it with a 400 without deploying it', () => {
      expect({ status, deployed }).toEqual({ status: 400, deployed: false })
    })
  })
})
