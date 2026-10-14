import FormData from 'form-data'
import { ClientRequest, request } from 'http'
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
const UPLOADS_PER_SOURCE = 2
const ACCOUNT_BUDGET_BYTES = 20_000

function uniqueContents(count: number): Record<string, Buffer> {
  // Storage is content-addressed and survives resetServer, so each run needs unique bytes.
  const nonce = `${Date.now()}-${Math.random()}`
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`file-${i}.txt`, Buffer.from(`content ${i} ${nonce}`)])
  )
}

// One file a single upload can never fit in the per-account storage budget.
function oversizedContents(): Record<string, Buffer> {
  return {
    'oversized.bin': Buffer.concat([Buffer.from(`${Date.now()}-${Math.random()}`), Buffer.alloc(ACCOUNT_BUDGET_BYTES)])
  }
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

  // Sends the headers and half of the body, then stalls, holding the upload in flight.
  function startStalledUpload(clientIp: string, form: FormData, query: string): ClientRequest {
    const body = form.getBuffer()
    const stalled = request(`${server.getUrl()}/entities${query}`, {
      method: 'POST',
      headers: { ...form.getHeaders(), 'content-length': String(body.length), [CLIENT_IP_HEADER]: clientIp }
    })
    stalled.on('error', () => undefined)
    stalled.write(body.subarray(0, body.length / 2))
    return stalled
  }

  async function waitForCalls(spy: jest.SpyInstance, calls: number): Promise<void> {
    while (spy.mock.calls.length < calls) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  function partialBatches(deployment: PreparedDeployment): string[][] {
    const [firstHash, ...otherHashes] = deployment.contentHashes
    return [[deployment.entityId, firstHash], ...otherHashes.map((hash) => [hash])]
  }

  beforeAll(async () => {
    server = await createDefaultServer({
      [EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_MAX]: BURST_LIMIT,
      [EnvironmentConfig.POST_ENTITIES_DAILY_QUOTA_MAX]: DAILY_QUOTA,
      [EnvironmentConfig.TRUSTED_CLIENT_IP_HEADER]: CLIENT_IP_HEADER,
      [EnvironmentConfig.MAX_CONCURRENT_UPLOADS_PER_SOURCE]: UPLOADS_PER_SOURCE,
      [EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER]: ACCOUNT_BUDGET_BYTES
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

    describe('and it starts a new partial upload declared with the partial query parameter', () => {
      let stagingValidations: jest.SpyInstance

      beforeEach(async () => {
        exhausting = await exhaustDailyQuota('203.0.113.5', 50)
        stagingValidations = jest.spyOn(server.components.validator, 'validateStagingScene')
        const deployment = await prepareSceneDeployment(['54,50'], uniqueContents(1), identity)
        const keys = [deployment.entityId, ...deployment.contentHashes]
        status = await postFrom('203.0.113.5', buildPartialForm(deployment, keys), '?partial=true')
      })

      it('should rate limit it before checking its access', () => {
        expect({ exhausting, status, accessChecks: stagingValidations.mock.calls.length }).toEqual({
          exhausting: [200, 200],
          status: 429,
          accessChecks: 0
        })
      })
    })

    describe('and it resumes a partial upload it started before', () => {
      let started: number

      beforeEach(async () => {
        const deployment = await prepareSceneDeployment(['55,50'], uniqueContents(2), identity)
        const [firstBatch, secondBatch] = partialBatches(deployment)
        started = await postFrom('203.0.113.9', buildPartialForm(deployment, firstBatch), '?partial=true')
        // The first batch counted once; the rest is spent directly, as more requests would trip the burst limit.
        for (let i = 0; i < DAILY_QUOTA - 1; i++) {
          await server.components.deploymentQuota.consume('203.0.113.9')
        }
        status = await postFrom('203.0.113.9', buildPartialForm(deployment, secondBatch), '?partial=true')
      })

      it('should let the upload finish', () => {
        expect({ started, status }).toEqual({ started: 202, status: 200 })
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

  describe('when partial batches from a source are rejected before joining an upload', () => {
    let rejected: number[]
    let status: number

    beforeEach(async () => {
      jest.spyOn(server.components.crypto, 'validateSignature').mockResolvedValue({ ok: false, message: 'bad' })
      rejected = []
      for (let i = 0; i < DAILY_QUOTA; i++) {
        const deployment = await prepareSceneDeployment([`${90 + i},90`], uniqueContents(1), identity)
        rejected.push(
          await postFrom('203.0.113.10', buildPartialForm(deployment, [deployment.entityId]), '?partial=true')
        )
      }
      const deployment = await prepareSceneDeployment(['95,90'], uniqueContents(1), identity)
      const keys = [deployment.entityId, ...deployment.contentHashes]
      status = await postFrom('203.0.113.10', buildPartialForm(deployment, keys, false))
    })

    it('should count them against its daily quota', () => {
      expect({ rejected, status }).toEqual({ rejected: Array(DAILY_QUOTA).fill(400), status: 429 })
    })
  })

  describe('when partial uploads from a source are created and then rejected', () => {
    let rejected: number[]
    let status: number

    beforeEach(async () => {
      jest.spyOn(server.components.deployer, 'deployEntity').mockResolvedValue({ errors: ['invalid'] })
      rejected = []
      for (let i = 0; i < DAILY_QUOTA; i++) {
        const deployment = await prepareSceneDeployment([`${100 + i},100`], uniqueContents(1), identity)
        const keys = [deployment.entityId, ...deployment.contentHashes]
        rejected.push(await postFrom('203.0.113.11', buildPartialForm(deployment, keys), '?partial=true'))
      }
      jest.restoreAllMocks()
      makeNoopValidator(server.components)
      const deployment = await prepareSceneDeployment(['105,100'], uniqueContents(1), identity)
      const keys = [deployment.entityId, ...deployment.contentHashes]
      status = await postFrom('203.0.113.11', buildPartialForm(deployment, keys, false))
    })

    it('should count each upload once against its daily quota', () => {
      expect({ rejected, status }).toEqual({ rejected: Array(DAILY_QUOTA).fill(400), status: 429 })
    })
  })

  describe('when first partial batches from a source are over the per-account storage budget', () => {
    let rejected: number[]
    let pendingRows: unknown[]
    let status: number

    beforeEach(async () => {
      rejected = []
      pendingRows = []
      for (let i = 0; i < DAILY_QUOTA; i++) {
        const deployment = await prepareSceneDeployment([`${110 + i},110`], oversizedContents(), identity)
        const keys = [deployment.entityId, ...deployment.contentHashes]
        rejected.push(await postFrom('203.0.113.12', buildPartialForm(deployment, keys), '?partial=true'))
        pendingRows.push(
          await server.components.pendingDeploymentsRepository.getByEntityId(
            server.components.database,
            deployment.entityId
          )
        )
      }
      const deployment = await prepareSceneDeployment(['115,110'], uniqueContents(1), identity)
      const keys = [deployment.entityId, ...deployment.contentHashes]
      status = await postFrom('203.0.113.12', buildPartialForm(deployment, keys, false))
    })

    it('should count them against its daily quota and leave no upload pending', () => {
      expect({ rejected, pendingRows, status }).toEqual({
        rejected: Array(DAILY_QUOTA).fill(400),
        pendingRows: Array(DAILY_QUOTA).fill(undefined),
        status: 429
      })
    })
  })

  describe('when a resumed partial batch from a source is over the per-account storage budget', () => {
    let started: number
    let rejected: number
    let status: number

    beforeEach(async () => {
      const resumed = await prepareSceneDeployment(
        ['120,120'],
        { ...uniqueContents(1), ...oversizedContents() },
        identity
      )
      const [small, big] = resumed.contentHashes.sort(
        (a, b) => resumed.files.get(a)!.byteLength - resumed.files.get(b)!.byteLength
      )
      started = await postFrom('203.0.113.13', buildPartialForm(resumed, [resumed.entityId, small]), '?partial=true')
      rejected = await postFrom('203.0.113.13', buildPartialForm(resumed, [big]), '?partial=true')
      // Spent directly but for one, after the upload's own count: more requests would trip the burst limit first.
      for (let i = 0; i < DAILY_QUOTA - 2; i++) {
        await server.components.deploymentQuota.consume('203.0.113.13')
      }
      const deployment = await prepareSceneDeployment(['125,120'], uniqueContents(1), identity)
      const keys = [deployment.entityId, ...deployment.contentHashes]
      status = await postFrom('203.0.113.13', buildPartialForm(deployment, keys, false))
    })

    it('should not count it against its daily quota', () => {
      expect({ started, rejected, status }).toEqual({ started: 202, rejected: 400, status: 200 })
    })
  })

  describe('when a source creates a partial upload, resumes it and then sends a regular deployment', () => {
    let batches: number[]
    let status: number

    beforeEach(async () => {
      const upload = await prepareSceneDeployment(['130,130'], uniqueContents(3), identity)
      const [firstBatch, secondBatch] = partialBatches(upload)
      // One resume only: a fourth request would trip the burst limit first.
      batches = [
        await postFrom('203.0.113.14', buildPartialForm(upload, firstBatch), '?partial=true'),
        await postFrom('203.0.113.14', buildPartialForm(upload, secondBatch), '?partial=true')
      ]
      const deployment = await prepareSceneDeployment(['135,130'], uniqueContents(1), identity)
      const keys = [deployment.entityId, ...deployment.contentHashes]
      status = await postFrom('203.0.113.14', buildPartialForm(deployment, keys, false))
    })

    it('should count only the creation against its daily quota', () => {
      expect({ batches, status }).toEqual({ batches: [202, 202], status: 200 })
    })
  })

  describe('when a source already has its share of uploads in flight', () => {
    let stalled: ClientRequest[]
    let acquire: jest.SpyInstance
    let response: { status: number; retryAfter: string | null; body: unknown }

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(['80,80'], uniqueContents(1), identity)
      const form = buildPartialForm(deployment, [deployment.entityId, ...deployment.contentHashes])
      acquire = jest.spyOn(server.components.uploadBudget, 'acquire')
      stalled = Array.from({ length: UPLOADS_PER_SOURCE }, () =>
        startStalledUpload('203.0.113.8', form, '?partial=true')
      )
      await waitForCalls(acquire, UPLOADS_PER_SOURCE)
      const answer = await fetch(`${server.getUrl()}/entities?partial=true`, {
        method: 'POST',
        body: form.getBuffer(),
        headers: { ...form.getHeaders(), [CLIENT_IP_HEADER]: '203.0.113.8' }
      })
      response = { status: answer.status, retryAfter: answer.headers.get('retry-after'), body: await answer.json() }
    })

    afterEach(() => {
      stalled.forEach((upload) => upload.destroy())
    })

    it('should answer another partial batch from it with a 429 before reading its body', () => {
      expect({ response, bodiesRead: acquire.mock.calls.length }).toEqual({
        response: {
          status: 429,
          retryAfter: '5',
          body: { error: 'Too many uploads in progress from this client, please retry shortly.' }
        },
        bodiesRead: UPLOADS_PER_SOURCE
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
