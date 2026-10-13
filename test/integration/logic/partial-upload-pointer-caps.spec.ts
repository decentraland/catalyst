import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { IdentityType } from '@dcl/crypto'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import { buildPartialForm, postForm, prepareSceneDeployment } from '../../helpers/partial-deployments'
import { createIdentity } from '../E2ETestUtils'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'

const TTL_SECONDS = 60 * 60

// Starts an upload with its entity file only, leaving its content file missing.
async function startUpload(server: TestProgram, pointers: string[], identity: IdentityType): Promise<Response> {
  const nonce = `${Date.now()}-${Math.random()}`
  const deployment = await prepareSceneDeployment(pointers, { 'main.txt': Buffer.from(nonce) }, identity)
  return postForm(server, buildPartialForm(deployment, [deployment.entityId]))
}

async function startUploads(server: TestProgram, pointers: string[], identities: IdentityType[]): Promise<number[]> {
  const statuses: number[] = []
  for (const identity of identities) {
    statuses.push((await startUpload(server, pointers, identity)).status)
  }
  return statuses
}

describe('Integration - Partial upload per-parcel caps', () => {
  let server: TestProgram

  beforeEach(async () => {
    server = await createDefaultServer({
      [EnvironmentConfig.MAX_PENDING_UPLOADS_PER_POINTER]: 4,
      // Lets one test client send every concurrent upload of a race.
      [EnvironmentConfig.MAX_CONCURRENT_UPLOADS_PER_SOURCE]: 16
    })
    // The scheduled cleanup runs once at startup and could reclaim an upload a test just expired.
    await server.components.pendingDeploymentsCleanupJob[STOP_COMPONENT]?.()
    await resetServer(server)
    makeNoopValidator(server.components)
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await server.stopProgram()
  })

  describe('when several accounts hold the cap of uploads on the same parcels', () => {
    let admitted: number[]
    let rejected: Response
    let body: unknown
    let retryAfter: number
    let elsewhere: Response
    let incrementSpy: jest.SpyInstance

    beforeEach(async () => {
      admitted = await startUploads(
        server,
        ['5,5', '5,6'],
        [1, 2, 3, 4].map(() => createIdentity())
      )
      incrementSpy = jest.spyOn(server.components.metrics, 'increment')
      rejected = await startUpload(server, ['5,6'], createIdentity())
      body = await rejected.json()
      retryAfter = Number(rejected.headers.get('Retry-After'))
      elsewhere = await startUpload(server, ['9,9'], createIdentity())
    })

    it('should admit the uploads up to the cap', () => {
      expect(admitted).toEqual([202, 202, 202, 202])
    })

    it('should reject another account overlapping those parcels with a 429 naming the full parcel', () => {
      expect({ status: rejected.status, body }).toEqual({
        status: 429,
        body: {
          errors: [
            'Too many partial uploads in progress for parcels 5,6 (max 4 per parcel). Complete an upload or wait for one to expire.'
          ]
        }
      })
    })

    it('should ask the client to retry when the oldest upload on the parcel expires', () => {
      expect(retryAfter).toBeGreaterThan(TTL_SECONDS - 60)
      expect(retryAfter).toBeLessThanOrEqual(TTL_SECONDS)
    })

    it('should count the rejection under its throttle reason', () => {
      expect(incrementSpy).toHaveBeenCalledWith('dcl_partial_upload_throttled_total', {
        reason: 'uploads_per_pointer'
      })
    })

    it('should still admit an upload on other parcels', () => {
      expect(elsewhere.status).toBe(202)
    })
  })

  describe('when one account holds all but one of the uploads allowed on a parcel', () => {
    let identity: IdentityType
    let admitted: number[]
    let own: Response
    let body: unknown
    let other: Response

    beforeEach(async () => {
      identity = createIdentity()
      admitted = await startUploads(server, ['6,6'], [identity, identity, identity])
      own = await startUpload(server, ['6,6'], identity)
      body = await own.json()
      other = await startUpload(server, ['6,6'], createIdentity())
    })

    it('should admit its uploads up to its share', () => {
      expect(admitted).toEqual([202, 202, 202])
    })

    it('should reject another upload of the account on the parcel with a 429', () => {
      expect({ status: own.status, body }).toEqual({
        status: 429,
        body: {
          errors: [
            'Too many partial uploads in progress for this account on parcels 6,6 (max 3 per parcel). Complete an upload or wait for one to expire.'
          ]
        }
      })
    })

    it('should leave the last slot to another account', () => {
      expect(other.status).toBe(202)
    })
  })

  describe('when more accounts than the cap start uploads on the same parcel at once', () => {
    let statuses: number[]
    let pending: number

    beforeEach(async () => {
      const responses = await Promise.all(
        [1, 2, 3, 4, 5, 6, 7, 8].map(() => startUpload(server, ['7,7'], createIdentity()))
      )
      statuses = responses.map((response) => response.status).sort()
      const result = await server.components.database.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM pending_deployments'
      )
      pending = Number(result.rows[0].count)
    })

    it('should admit exactly the cap and reject the rest', () => {
      expect(statuses).toEqual([202, 202, 202, 202, 429, 429, 429, 429])
    })

    it('should keep only the admitted uploads', () => {
      expect(pending).toBe(4)
    })
  })

  describe('when the uploads holding the cap on a parcel have expired', () => {
    let response: Response

    beforeEach(async () => {
      await startUploads(
        server,
        ['8,8'],
        [1, 2, 3, 4].map(() => createIdentity())
      )
      await server.components.database.query(`UPDATE pending_deployments SET created_at = now() - interval '2 hours'`)
      response = await startUpload(server, ['8,8'], createIdentity())
    })

    it('should admit a new upload on the parcel without waiting for cleanup', () => {
      expect(response.status).toBe(202)
    })
  })
})
