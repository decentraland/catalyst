import { IdentityType } from '@dcl/crypto'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import {
  buildPartialForm,
  postForm,
  PreparedDeployment,
  prepareSceneDeployment
} from '../../helpers/partial-deployments'
import { createIdentity } from '../E2ETestUtils'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'

const CONTENT_SIZE = 2500

// Two content files keep an upload incomplete while only the large one is staged.
async function prepareUpload(identity: IdentityType, label: string): Promise<PreparedDeployment> {
  const nonce = `${label}-${Date.now()}-${Math.random()}`
  return prepareSceneDeployment(
    ['3,3'],
    { 'large.bin': Buffer.alloc(CONTENT_SIZE, nonce), 'small.txt': Buffer.from(`small ${nonce}`) },
    identity
  )
}

function largeHash(deployment: PreparedDeployment): string {
  return deployment.contentHashes.find((hash) => deployment.files.get(hash)!.byteLength === CONTENT_SIZE)!
}

function stageLarge(server: TestProgram, deployment: PreparedDeployment): Promise<Response> {
  return postForm(server, buildPartialForm(deployment, [deployment.entityId, largeHash(deployment)]))
}

async function expireUploads(server: TestProgram): Promise<void> {
  await server.components.database.query(`UPDATE pending_deployments SET created_at = now() - interval '2 days'`)
}

async function pendingEntityIds(server: TestProgram): Promise<string[]> {
  const result = await server.components.database.query<{ entity_id: string }>(
    'SELECT entity_id FROM pending_deployments ORDER BY entity_id'
  )
  return result.rows.map((row) => row.entity_id)
}

describe('Integration - Partial upload accounting', () => {
  let server: TestProgram
  let identity: IdentityType

  beforeEach(async () => {
    server = await createDefaultServer({
      [EnvironmentConfig.MAX_PENDING_BYTES_PER_DEPLOYER]: 4000,
      [EnvironmentConfig.MAX_PENDING_BYTES]: 5000,
      [EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE]: 100_000,
      [EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER]: 3
    })
    await resetServer(server)
    makeNoopValidator(server.components)
    identity = createIdentity()
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await server.stopProgram()
  })

  describe('when one account stages overlapping uploads beyond its byte budget', () => {
    let second: Response

    beforeEach(async () => {
      await stageLarge(server, await prepareUpload(identity, 'first'))
      second = await stageLarge(server, await prepareUpload(identity, 'second'))
    })

    it('should reject the upload that exceeds the budget with 400', async () => {
      expect({ status: second.status, body: await second.json() }).toEqual({
        status: 400,
        body: { errors: ['Partial upload storage budget exceeded. Complete uploads or wait for cleanup.'] }
      })
    })

    it('should keep both uploads without replacing either', async () => {
      expect(await pendingEntityIds(server)).toHaveLength(2)
    })
  })

  describe('when two accounts race the server-wide byte budget', () => {
    let statuses: number[]

    beforeEach(async () => {
      const [first, second] = await Promise.all([
        prepareUpload(identity, 'first'),
        prepareUpload(createIdentity(), 'second')
      ])
      const responses = await Promise.all([stageLarge(server, first), stageLarge(server, second)])
      statuses = responses.map((response) => response.status).sort()
    })

    it('should admit exactly one of them', () => {
      expect(statuses).toEqual([202, 400])
    })
  })

  describe('when a batch is retried', () => {
    let deployment: PreparedDeployment
    let batchBytes: number

    beforeEach(async () => {
      deployment = await prepareUpload(identity, 'retry')
      batchBytes = deployment.files.get(deployment.entityId)!.byteLength + CONTENT_SIZE
      await stageLarge(server, deployment)
      await stageLarge(server, deployment)
    })

    it('should reserve storage once while charging both requests against the byte rate', async () => {
      const result = await server.components.database.query<{ reserved_bytes: string; bytes: string }>(
        'SELECT p.reserved_bytes, r.bytes FROM pending_deployments p JOIN partial_upload_rates r USING (deployer_address)'
      )
      expect(result.rows).toEqual([{ reserved_bytes: String(batchBytes), bytes: String(2 * batchBytes) }])
    })
  })

  describe('when the account holds its maximum number of uploads and they have expired', () => {
    let response: Response

    beforeEach(async () => {
      for (const label of ['one', 'two', 'three']) {
        const deployment = await prepareUpload(identity, label)
        await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      }
      await expireUploads(server)
      const extra = await prepareUpload(identity, 'extra')
      response = await postForm(server, buildPartialForm(extra, [extra.entityId]))
    })

    it('should keep counting the expired uploads until cleanup', () => {
      expect(response.status).toBe(400)
    })
  })

  describe('when an expired upload still holds storage', () => {
    let expired: PreparedDeployment
    let next: PreparedDeployment

    beforeEach(async () => {
      expired = await prepareUpload(identity, 'expired')
      await stageLarge(server, expired)
      await expireUploads(server)
      next = await prepareUpload(identity, 'next')
    })

    describe('and a new upload is staged before cleanup', () => {
      let response: Response

      beforeEach(async () => {
        response = await stageLarge(server, next)
      })

      it('should reject it because the expired bytes stay charged', () => {
        expect(response.status).toBe(400)
      })
    })

    describe('and cleanup runs', () => {
      let response: Response

      beforeEach(async () => {
        await server.components.partialDeployments.cleanupExpired()
        response = await stageLarge(server, next)
      })

      it('should admit the new upload', () => {
        expect(response.status).toBe(202)
      })

      it('should delete the expired upload unreferenced content', async () => {
        expect(await server.components.storage.exist(largeHash(expired))).toBe(false)
      })
    })

    describe('and physical deletion fails during cleanup', () => {
      let cleanupError: string | undefined
      let response: Response

      beforeEach(async () => {
        jest.spyOn(server.components.storage, 'delete').mockRejectedValueOnce(new Error('storage unavailable'))
        cleanupError = await server.components.partialDeployments.cleanupExpired().then(
          () => undefined,
          (error: Error) => error.message
        )
        response = await stageLarge(server, next)
      })

      it('should fail the cleanup and keep the expired bytes charged', () => {
        expect({ cleanupError, status: response.status }).toEqual({ cleanupError: 'storage unavailable', status: 400 })
      })
    })

    describe('and a live upload references the same content', () => {
      let sharing: PreparedDeployment

      beforeEach(async () => {
        sharing = await prepareSceneDeployment(
          ['4,4'],
          { 'large.bin': Buffer.from(expired.files.get(largeHash(expired))!), 'other.txt': Buffer.from('other') },
          identity
        )
        await postForm(server, buildPartialForm(sharing, [sharing.entityId]))
        await server.components.partialDeployments.cleanupExpired()
      })

      it('should release the expired upload without deleting the content the live upload retains', async () => {
        expect({
          stored: await server.components.storage.exist(largeHash(expired)),
          pending: await pendingEntityIds(server)
        }).toEqual({ stored: true, pending: [sharing.entityId] })
      })
    })
  })

  describe('when a storage mutation holds the shared content lock', () => {
    let deletedWhileHeld: boolean
    let overlapped: boolean

    beforeEach(async () => {
      let mutationActive = false
      let deleting = false
      overlapped = false
      let releaseMutation: () => void = () => undefined
      let acquired: () => void = () => undefined
      const started = new Promise<void>((resolve) => {
        acquired = resolve
      })
      const mutation = server.components.contentLocks.withRead(async () => {
        mutationActive = true
        acquired()
        await new Promise<void>((resolve) => {
          releaseMutation = resolve
        })
        mutationActive = false
      })
      await started
      const deletion = server.components.contentLocks.withWrite(async () => {
        deleting = true
        overlapped = mutationActive
      })
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
      deletedWhileHeld = deleting
      releaseMutation()
      await Promise.all([mutation, deletion])
    })

    it('should make garbage collection wait until the mutation settles', () => {
      expect({ deletedWhileHeld, overlapped }).toEqual({ deletedWhileHeld: false, overlapped: false })
    })
  })
})
