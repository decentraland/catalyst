import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { IdentityType } from '@dcl/crypto'
import { bufferToStream } from '@dcl/catalyst-storage'
import { EntityType } from '@dcl/schemas'
import { EntityLockTimeoutError } from '../../../src/adapters/content-locks'
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
const MAX_FILE_SIZE = 1024 * 1024
// The least rate startup accepts: the 10 MiB entity file cap plus one maximum-size file.
const BYTES_PER_MINUTE = MAX_FILE_SIZE + 10 * 1024 * 1024
const OVERSIZED_PART_SIZE = MAX_FILE_SIZE / 2
const TTL_SECONDS = 60 * 60
const CLEANUP_INTERVAL_SECONDS = 5 * 60

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

async function reservedBytes(server: TestProgram, entityId: string): Promise<number> {
  const result = await server.components.database.query<{ reserved_bytes: string }>(
    `SELECT reserved_bytes FROM pending_deployments WHERE entity_id = '${entityId}'`
  )
  return Number(result.rows[0].reserved_bytes)
}

async function storeContent(server: TestProgram, deployment: PreparedDeployment, hashes: string[]): Promise<void> {
  for (const hash of hashes) {
    await server.components.storage.storeStream(hash, bufferToStream(deployment.files.get(hash)!))
  }
}

function sizeOf(deployment: PreparedDeployment, hashes: string[]): number {
  return hashes.reduce((sum, hash) => sum + deployment.files.get(hash)!.byteLength, 0)
}

// Two large files over the account budget together, plus two small ones to send in separate batches.
async function prepareMostlyStoredUpload(
  server: TestProgram,
  identity: IdentityType
): Promise<{ deployment: PreparedDeployment; storedHashes: string[]; newHash: string; lastHash: string }> {
  const nonce = `mostly-stored-${Date.now()}-${Math.random()}`
  const deployment = await prepareSceneDeployment(
    ['3,3'],
    {
      'stored-1.bin': Buffer.alloc(CONTENT_SIZE, `${nonce}-1`),
      'stored-2.bin': Buffer.alloc(CONTENT_SIZE, `${nonce}-2`),
      'new.txt': Buffer.from(`new ${nonce}`),
      'last.txt': Buffer.from(`last ${nonce}`)
    },
    identity
  )
  const storedHashes = deployment.contentHashes.filter(
    (hash) => deployment.files.get(hash)!.byteLength === CONTENT_SIZE
  )
  const [newHash, lastHash] = deployment.contentHashes.filter((hash) => !storedHashes.includes(hash))
  await storeContent(server, deployment, storedHashes)
  return { deployment, storedHashes, newHash, lastHash }
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
      [EnvironmentConfig.MAX_UPLOAD_FILE_SIZE]: MAX_FILE_SIZE,
      [EnvironmentConfig.MAX_PARTIAL_UPLOAD_BYTES_PER_MINUTE]: BYTES_PER_MINUTE,
      [EnvironmentConfig.MAX_PENDING_DEPLOYMENTS_PER_DEPLOYER]: 3
    })
    // The scheduled cleanup runs once at startup and could reclaim an upload a test just expired.
    await server.components.pendingDeploymentsCleanupJob[STOP_COMPONENT]?.()
    await resetServer(server)
    makeNoopValidator(server.components)
    identity = createIdentity()
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await server.stopProgram()
  })

  describe('when one account stages overlapping uploads beyond its byte budget', () => {
    let first: PreparedDeployment
    let second: Response
    let body: { errors: string[] }
    let retryAfter: number

    beforeEach(async () => {
      first = await prepareUpload(identity, 'first')
      await stageLarge(server, first)
      second = await stageLarge(server, await prepareUpload(identity, 'second'))
      body = (await second.json()) as { errors: string[] }
      retryAfter = Number(second.headers.get('Retry-After'))
    })

    it('should reject the upload that exceeds the budget with a 429 naming the staged and allowed bytes', () => {
      expect({ status: second.status, error: body.errors[0] }).toEqual({
        status: 429,
        error: expect.stringMatching(
          /^Partial upload storage budget exceeded for this account: \d+ bytes staged with this batch, max 4000\. Complete uploads or wait for cleanup\.$/
        )
      })
    })

    it('should ask the client to retry once the admitted upload expires and cleanup reclaims it', () => {
      expect(retryAfter).toBeGreaterThan(TTL_SECONDS - 60)
      expect(retryAfter).toBeLessThanOrEqual(TTL_SECONDS + CLEANUP_INTERVAL_SECONDS)
    })

    it('should keep the admitted upload and discard the rejected one so it holds no upload slot', async () => {
      expect(await pendingEntityIds(server)).toEqual([first.entityId])
    })

    it('should still charge the rejected batch against the byte rate', async () => {
      const result = await server.components.database.query<{ bytes: string }>('SELECT bytes FROM partial_upload_rates')
      expect(Number(result.rows[0].bytes)).toBeGreaterThanOrEqual(2 * CONTENT_SIZE)
    })
  })

  describe('when an account exceeds its byte budget while another account holds an older expired upload', () => {
    let retryAfter: number

    beforeEach(async () => {
      const other = await prepareUpload(createIdentity(), 'other')
      await postForm(server, buildPartialForm(other, [other.entityId]))
      await expireUploads(server)
      await stageLarge(server, await prepareUpload(identity, 'first'))
      const response = await stageLarge(server, await prepareUpload(identity, 'second'))
      retryAfter = Number(response.headers.get('Retry-After'))
    })

    it('should time the retry by the oldest upload of the account, not of the other account', () => {
      expect(retryAfter).toBeGreaterThan(TTL_SECONDS - 60)
    })
  })

  describe('when another account stages an upload past the server-wide byte budget', () => {
    let response: Response
    let body: unknown
    let retryAfter: number

    beforeEach(async () => {
      await stageLarge(server, await prepareUpload(identity, 'first'))
      response = await stageLarge(server, await prepareUpload(createIdentity(), 'second'))
      body = await response.json()
      retryAfter = Number(response.headers.get('Retry-After'))
    })

    it('should reject it with a 429 saying the server is full', () => {
      expect({ status: response.status, body }).toEqual({
        status: 429,
        body: { errors: ['Partial upload storage on this server is full. Retry later.'] }
      })
    })

    it('should ask the client to retry once the first upload expires and cleanup reclaims it', () => {
      expect(retryAfter).toBeGreaterThan(TTL_SECONDS - 60)
      expect(retryAfter).toBeLessThanOrEqual(TTL_SECONDS + CLEANUP_INTERVAL_SECONDS)
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

    it('should admit exactly one of them and ask the other to retry later', () => {
      expect(statuses).toEqual([202, 429])
    })
  })

  describe('when the account has used up its one-minute byte rate', () => {
    let response: Response
    let body: { errors: string[] }
    let retryAfter: number

    beforeEach(async () => {
      await stageLarge(server, await prepareUpload(identity, 'first'))
      await server.components.database.query(
        `UPDATE partial_upload_rates SET bytes = ${BYTES_PER_MINUTE}, window_started = now() - interval '45 seconds'`
      )
      response = await stageLarge(server, await prepareUpload(identity, 'second'))
      body = (await response.json()) as { errors: string[] }
      retryAfter = Number(response.headers.get('Retry-After'))
    })

    it('should reject the batch with a 429 naming the window total and the limit', () => {
      expect({ status: response.status, error: body.errors[0] }).toEqual({
        status: 429,
        error: expect.stringMatching(
          new RegExp(
            `^Partial upload byte rate exceeded for this account: \\d+ bytes in the current one-minute window, max ${BYTES_PER_MINUTE}\\. Retry in \\d+ s\\.$`
          )
        )
      })
    })

    it('should ask the client, in the header and the message, to retry when the window ends', () => {
      expect(retryAfter).toBeGreaterThanOrEqual(10)
      expect(retryAfter).toBeLessThanOrEqual(15)
      expect(body.errors[0]).toContain(`Retry in ${retryAfter} s.`)
    })
  })

  describe('when a single batch is larger than the one-minute byte rate', () => {
    let deployment: PreparedDeployment
    let batchBytes: number
    let response: Response
    let body: { errors: string[] }

    beforeEach(async () => {
      const nonce = `oversized-${Date.now()}-${Math.random()}`
      const files: Record<string, Buffer> = {}
      for (let i = 0; i * OVERSIZED_PART_SIZE <= BYTES_PER_MINUTE; i++) {
        files[`part-${i}.bin`] = Buffer.alloc(OVERSIZED_PART_SIZE, `${nonce}-${i}`)
      }
      deployment = await prepareSceneDeployment(['3,3'], files, identity)
      batchBytes = Array.from(deployment.files.values()).reduce((sum, file) => sum + file.byteLength, 0)
      response = await postForm(
        server,
        buildPartialForm(deployment, [deployment.entityId, ...deployment.contentHashes])
      )
      body = (await response.json()) as { errors: string[] }
    })

    it('should reject it with a 400 naming its size and the limit, since no window can admit it', () => {
      expect({ status: response.status, retryAfter: response.headers.get('Retry-After'), errors: body.errors }).toEqual(
        {
          status: 400,
          retryAfter: null,
          errors: [
            `This batch is ${batchBytes} bytes, over the partial upload byte rate limit of ${BYTES_PER_MINUTE} bytes per minute. Send it in smaller batches.`
          ]
        }
      )
    })

    it('should still charge the rejected batch against the byte rate', async () => {
      const result = await server.components.database.query<{ bytes: string }>('SELECT bytes FROM partial_upload_rates')
      expect(result.rows).toEqual([{ bytes: String(batchBytes) }])
    })
  })

  describe('when a single upload needs more storage than the account budget on its own', () => {
    let deployment: PreparedDeployment
    let response: Response
    let body: { errors: string[] }

    beforeEach(async () => {
      const nonce = `too-big-${Date.now()}-${Math.random()}`
      deployment = await prepareSceneDeployment(
        ['3,3'],
        {
          'first.bin': Buffer.alloc(CONTENT_SIZE, `${nonce}-first`),
          'second.bin': Buffer.alloc(CONTENT_SIZE, `${nonce}-second`),
          'small.txt': Buffer.from(`small ${nonce}`)
        },
        identity
      )
      const largeHashes = deployment.contentHashes.filter(
        (hash) => deployment.files.get(hash)!.byteLength === CONTENT_SIZE
      )
      response = await postForm(server, buildPartialForm(deployment, [deployment.entityId, ...largeHashes]))
      body = (await response.json()) as { errors: string[] }
    })

    it('should reject it with a 400 naming the budget and the bytes it needs, since cleanup can never make room', () => {
      expect({ status: response.status, retryAfter: response.headers.get('Retry-After'), errors: body.errors }).toEqual(
        {
          status: 400,
          retryAfter: null,
          errors: [
            `This upload needs ${
              deployment.files.get(deployment.entityId)!.byteLength + 2 * CONTENT_SIZE
            } bytes of partial upload storage, over the per-account budget of 4000 bytes.`
          ]
        }
      )
    })
  })

  describe('when a batch is retried', () => {
    let deployment: PreparedDeployment
    let batchBytes: number
    let rewritten: string[]

    beforeEach(async () => {
      deployment = await prepareUpload(identity, 'retry')
      batchBytes = deployment.files.get(deployment.entityId)!.byteLength + CONTENT_SIZE
      await stageLarge(server, deployment)
      const storeStream = jest.spyOn(server.components.storage, 'storeStream')
      await stageLarge(server, deployment)
      rewritten = storeStream.mock.calls.map(([id]) => id).filter((id) => deployment.files.has(id))
    })

    it('should reserve storage once while charging both requests against the byte rate', async () => {
      const result = await server.components.database.query<{ reserved_bytes: string; bytes: string }>(
        'SELECT p.reserved_bytes, r.bytes FROM pending_deployments p JOIN partial_upload_rates r USING (deployer_address)'
      )
      expect(result.rows).toEqual([{ reserved_bytes: String(batchBytes), bytes: String(2 * batchBytes) }])
    })

    it('should not write the files the first request already stored again', () => {
      expect(rewritten).toEqual([])
    })
  })

  describe('when most of an upload is already in storage', () => {
    let deployment: PreparedDeployment
    let newHash: string
    let lastHash: string
    let response: Response
    let reserved: number

    beforeEach(async () => {
      ;({ deployment, newHash, lastHash } = await prepareMostlyStoredUpload(server, identity))
      response = await postForm(server, buildPartialForm(deployment, [deployment.entityId, newHash]))
      reserved = await reservedBytes(server, deployment.entityId)
    })

    it('should admit it although the whole scene is over the account budget, charging only the bytes it stores', async () => {
      expect({ status: response.status, body: await response.json(), reserved }).toEqual({
        status: 202,
        body: { missing: [lastHash] },
        reserved: sizeOf(deployment, [deployment.entityId, newHash])
      })
    })

    describe('and its last file is uploaded', () => {
      let lastResponse: Response

      beforeEach(async () => {
        lastResponse = await postForm(server, buildPartialForm(deployment, [lastHash]))
      })

      it('should publish it', () => {
        expect(lastResponse.status).toBe(200)
      })
    })
  })

  describe('when a batch re-sends files that are already in storage', () => {
    let deployment: PreparedDeployment
    let storedHashes: string[]
    let newHash: string
    let batch: string[]
    let response: Response
    let rewritten: string[]

    beforeEach(async () => {
      ;({ deployment, storedHashes, newHash } = await prepareMostlyStoredUpload(server, identity))
      batch = [deployment.entityId, newHash, ...storedHashes]
      const storeStream = jest.spyOn(server.components.storage, 'storeStream')
      response = await postForm(server, buildPartialForm(deployment, batch))
      rewritten = storeStream.mock.calls.map(([id]) => id).filter((id) => storedHashes.includes(id))
    })

    it('should admit the batch without writing those files again', () => {
      expect({ status: response.status, rewritten }).toEqual({ status: 202, rewritten: [] })
    })

    it('should charge only the files it stores against the staging budgets', async () => {
      expect(await reservedBytes(server, deployment.entityId)).toBe(sizeOf(deployment, [deployment.entityId, newHash]))
    })

    it('should still charge every received byte against the byte rate', async () => {
      const result = await server.components.database.query<{ bytes: string }>('SELECT bytes FROM partial_upload_rates')
      expect(result.rows).toEqual([{ bytes: String(sizeOf(deployment, batch)) }])
    })
  })

  describe('when the files already in storage push a scene over its size limit', () => {
    let response: Response

    beforeEach(async () => {
      jest.spyOn(server.components.validator, 'getMaxSizeInBytesPerPointer').mockReturnValue(CONTENT_SIZE * 2)
      const { deployment, newHash } = await prepareMostlyStoredUpload(server, identity)
      response = await postForm(server, buildPartialForm(deployment, [deployment.entityId, newHash]))
    })

    it('should reject it as too big, counting every file of the scene', async () => {
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 400,
        body: { errors: ['Deployment failed: The deployment is too big.'] }
      })
    })
  })

  describe('when the account holds its maximum number of uploads and they have expired', () => {
    let response: Response
    let body: unknown
    let retryAfter: number

    beforeEach(async () => {
      for (const label of ['one', 'two', 'three']) {
        const deployment = await prepareUpload(identity, label)
        await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      }
      await expireUploads(server)
      const extra = await prepareUpload(identity, 'extra')
      response = await postForm(server, buildPartialForm(extra, [extra.entityId]))
      body = await response.json()
      retryAfter = Number(response.headers.get('Retry-After'))
    })

    it('should keep counting the expired uploads until cleanup, rejecting with a 429', () => {
      expect({ status: response.status, body }).toEqual({
        status: 429,
        body: {
          errors: [
            'Too many partial uploads in progress for this account (max 3). Complete an upload or wait for expired uploads to be cleaned up.'
          ]
        }
      })
    })

    it('should ask the client to retry after the next cleanup run', () => {
      expect(retryAfter).toBeGreaterThanOrEqual(1)
      expect(retryAfter).toBeLessThanOrEqual(CLEANUP_INTERVAL_SECONDS)
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

    describe('and a new upload is staged three minutes after a cleanup run that missed it', () => {
      let response: Response
      let retryAfter: number

      beforeEach(async () => {
        jest.spyOn(server.components.pendingDeploymentsRepository, 'listExpired').mockResolvedValueOnce([])
        await server.components.partialDeployments.cleanupExpired()
        const realNow = Date.now.bind(Date)
        jest.spyOn(Date, 'now').mockImplementation(() => realNow() + 3 * 60 * 1000)
        response = await stageLarge(server, next)
        retryAfter = Number(response.headers.get('Retry-After'))
      })

      it('should reject it with a 429 because the expired bytes stay charged', () => {
        expect(response.status).toBe(429)
      })

      it('should ask the client to retry at the next cleanup run, about two minutes on', () => {
        expect(retryAfter).toBeGreaterThan(CLEANUP_INTERVAL_SECONDS - 4 * 60)
        expect(retryAfter).toBeLessThanOrEqual(CLEANUP_INTERVAL_SECONDS - 3 * 60)
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
        // Fail only this upload's deletes: background jobs (e.g. snapshot generation) also call delete.
        const deleteContent = server.components.storage.delete.bind(server.components.storage)
        jest.spyOn(server.components.storage, 'delete').mockImplementation(async (keys: string[]) => {
          if (keys.includes(largeHash(expired))) {
            throw new Error('storage unavailable')
          }
          return deleteContent(keys)
        })
        cleanupError = await server.components.partialDeployments.cleanupExpired().then(
          () => undefined,
          (error: Error) => error.message
        )
        response = await stageLarge(server, next)
      })

      it('should fail the cleanup and keep the expired bytes charged', () => {
        expect({ cleanupError, status: response.status }).toEqual({ cleanupError: 'storage unavailable', status: 429 })
      })
    })

    describe('and deployments keep the content lock busy during cleanup', () => {
      let cleanupError: unknown
      let removed: number | undefined
      let stored: boolean
      let pending: string[]

      beforeEach(async () => {
        jest.spyOn(server.components.contentLocks, 'withWrite').mockRejectedValueOnce(new EntityLockTimeoutError())
        ;[removed, cleanupError] = await server.components.partialDeployments.cleanupExpired().then(
          (count) => [count, undefined],
          (error) => [undefined, error]
        )
        stored = await server.components.storage.exist(largeHash(expired))
        pending = await pendingEntityIds(server)
      })

      it('should defer the upload to the next run and keep it charged', () => {
        expect({ cleanupError, removed, stored, pending }).toEqual({
          cleanupError: undefined,
          removed: 0,
          stored: true,
          pending: [expired.entityId]
        })
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
        // Admission would count the expired upload's bytes against this one, so the live upload is
        // recorded directly: the case under test is cleanup honoring its reference.
        await server.components.pendingDeploymentsRepository.insert(server.components.database, {
          entityId: sharing.entityId,
          entityType: EntityType.SCENE,
          pointers: ['4,4'],
          contentHashes: sharing.contentHashes,
          deployerAddress: identity.address.toLowerCase(),
          createdAt: Date.now()
        })
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
