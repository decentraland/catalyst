import { Authenticator, IdentityType } from '@dcl/crypto'
import FormData = require('form-data')
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import { createIdentity } from '../E2ETestUtils'
import {
  buildPartialForm,
  postForm,
  PreparedDeployment,
  prepareSceneDeployment
} from '../../helpers/partial-deployments'
import { partialDeploymentContract } from '../../contracts/partial-deployment'

async function countPendingDeployments(server: TestProgram): Promise<number> {
  const result = await server.components.database.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM pending_deployments'
  )
  return parseInt(result.rows[0].count)
}

async function pendingEntityIds(server: TestProgram): Promise<string[]> {
  const result = await server.components.database.query<{ entity_id: string }>(
    'SELECT entity_id FROM pending_deployments'
  )
  return result.rows.map((r) => r.entity_id)
}

async function countDeployments(server: TestProgram, entityId: string): Promise<number> {
  const result = await server.components.deploymentsRepository.getEntityById(server.components.database, entityId)
  return result ? 1 : 0
}

describe('Integration - Partial deployments', () => {
  let server: TestProgram
  let identity: IdentityType

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await server.stopProgram()
    server = null as any
  })

  beforeEach(async () => {
    await resetServer(server)
    // The staging + finalize validation subsets are exercised in unit tests; here we bypass them to
    // focus on the multi-request staging protocol, storage, pending-row lifecycle, and auto-finalize.
    makeNoopValidator(server.components)
    identity = createIdentity()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when uploading a scene across multiple partial requests', () => {
    describe('and each content file is uploaded in its own batch', () => {
      let deployment: PreparedDeployment
      let hashA: string
      let hashB: string
      let firstResponse: Response

      beforeEach(async () => {
        // Unique content per test run: storage is content-addressed and survives resetServer, so reused
        // bytes from a previous run would satisfy the completeness check and auto-finalize early.
        const nonce = `${Date.now()}-${Math.random()}`
        deployment = await prepareSceneDeployment(
          ['0,0'],
          { 'a.txt': Buffer.from(`content of file a ${nonce}`), 'b.txt': Buffer.from(`content of file b ${nonce}`) },
          identity
        )
        ;[hashA, hashB] = deployment.contentHashes

        // Request 1: entity file only.
        firstResponse = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      })

      it('should respond 202 with both content hashes missing and create a single pending row', async () => {
        expect(firstResponse.status).toBe(202)
        expect(new Set((await firstResponse.json()).missing)).toEqual(new Set([hashA, hashB]))
        expect(await countPendingDeployments(server)).toBe(1)
      })

      describe('and the second batch uploads the first content file', () => {
        let secondResponse: Response

        beforeEach(async () => {
          secondResponse = await postForm(server, buildPartialForm(deployment, [hashA]))
        })

        it('should respond 202 with only the remaining hash missing', async () => {
          expect(secondResponse.status).toBe(202)
          expect(await secondResponse.json()).toEqual({ missing: [hashB] })
        })

        describe('and the last batch uploads the remaining content file', () => {
          let thirdResponse: Response

          beforeEach(async () => {
            // Last content file → auto-finalize.
            thirdResponse = await postForm(server, buildPartialForm(deployment, [hashB]))
          })

          it('should finalize with 200 and a creation timestamp', async () => {
            expect(thirdResponse.status).toBe(200)
            expect(typeof (await thirdResponse.json()).creationTimestamp).toBe('number')
          })

          it('should delete the pending row and make the entity live', async () => {
            expect(await countPendingDeployments(server)).toBe(0)
            const deployed = await server.components.deploymentsRepository.getEntityById(
              server.components.database,
              deployment.entityId
            )
            expect(deployed?.entityId).toBe(deployment.entityId)
          })
        })
      })
    })

    describe('and requests after the first omit the entity file', () => {
      let deployment: PreparedDeployment
      let hashA: string
      let firstResponse: Response

      beforeEach(async () => {
        // Unique content per test run: storage is content-addressed and survives resetServer.
        const nonce = `${Date.now()}-${Math.random()}`
        deployment = await prepareSceneDeployment(
          ['1,1'],
          { 'a.txt': Buffer.from(`another file a ${nonce}`) },
          identity
        )
        ;[hashA] = deployment.contentHashes
        firstResponse = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      })

      it('should accept the first batch with 202', () => {
        expect(firstResponse.status).toBe(202)
      })

      describe('and the content file is uploaded without the entity file', () => {
        let secondResponse: Response

        beforeEach(async () => {
          // The request omits the entity file entirely; the server reads it back from storage.
          secondResponse = await postForm(server, buildPartialForm(deployment, [hashA]))
        })

        it('should finalize with 200 and no pending row', async () => {
          expect(secondResponse.status).toBe(200)
          expect(await countPendingDeployments(server)).toBe(0)
        })
      })
    })
  })

  describe('when a single partial request already contains all the content', () => {
    let response: Response

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(['2,2'], { 'a.txt': Buffer.from('single batch file') }, identity)
      response = await postForm(
        server,
        buildPartialForm(deployment, [deployment.entityId, ...deployment.contentHashes])
      )
    })

    it('should finalize immediately with 200 and no pending row', async () => {
      expect(response.status).toBe(200)
      expect(await countPendingDeployments(server)).toBe(0)
    })
  })

  describe('when the same partial request is replayed', () => {
    let deployment: PreparedDeployment
    let firstResponse: Response
    let secondResponse: Response

    beforeEach(async () => {
      deployment = await prepareSceneDeployment(
        ['3,3'],
        { 'a.txt': Buffer.from('replay file a'), 'b.txt': Buffer.from('replay file b') },
        identity
      )
      firstResponse = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      secondResponse = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
    })

    it('should respond 202 to both requests with the same missing hashes', async () => {
      expect(firstResponse.status).toBe(202)
      expect(secondResponse.status).toBe(202)
      expect(new Set((await secondResponse.json()).missing)).toEqual(new Set(deployment.contentHashes))
    })

    it('should keep a single pending row', async () => {
      expect(await countPendingDeployments(server)).toBe(1)
    })
  })

  describe('when the first partial request omits the entity file', () => {
    let response: Response

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(['4,4'], { 'a.txt': Buffer.from('orphan content') }, identity)
      const [hashA] = deployment.contentHashes
      response = await postForm(server, buildPartialForm(deployment, [hashA]))
    })

    it('should return 400', () => {
      expect(response.status).toBe(400)
    })
  })

  describe('when an uploaded file does not match its declared hash key', () => {
    let response: Response

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(['5,5'], { 'a.txt': Buffer.from('mismatch content') }, identity)
      const form = new FormData()
      form.append('entityId', deployment.entityId)
      form.append('partial', 'true')
      form.append('authChain', JSON.stringify(deployment.authChain))
      // Entity file uploaded under a wrong key: its computed hash won't equal the key.
      form.append(
        'bafyWrongKey0000000000000000000000000000000000000000000000',
        Buffer.from(deployment.files.get(deployment.entityId)!),
        {
          filename: 'wrong'
        }
      )
      response = await postForm(server, form)
    })

    it('should return 400', () => {
      expect(response.status).toBe(400)
    })
  })

  describe('when a non-partial request is missing content (legacy behavior)', () => {
    let response: Response

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(['6,6'], { 'a.txt': Buffer.from('legacy file a') }, identity)
      // Full (non-partial) deploy with all content present → succeeds, no pending row involved.
      response = await postForm(
        server,
        buildPartialForm(deployment, [deployment.entityId, ...deployment.contentHashes], false)
      )
    })

    it('should still reach the deployer and not create a pending row', async () => {
      expect(response.status).toBe(200)
      expect(await countPendingDeployments(server)).toBe(0)
    })
  })

  describe('when staging requests for the same entity run in parallel', () => {
    describe('and two distinct content batches are uploaded concurrently', () => {
      let deployment: PreparedDeployment
      let hashA: string
      let hashB: string
      let stagingResponse: Response

      beforeEach(async () => {
        // Unique content per test run: storage is content-addressed and survives resetServer.
        const nonce = `${Date.now()}-${Math.random()}`
        deployment = await prepareSceneDeployment(
          ['7,7'],
          {
            'a.txt': Buffer.from(`parallel a ${nonce}`.repeat(50)),
            'b.txt': Buffer.from(`parallel b ${nonce}`.repeat(60))
          },
          identity
        )
        ;[hashA, hashB] = deployment.contentHashes
        stagingResponse = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      })

      it('should accept the staging request with 202', () => {
        expect(stagingResponse.status).toBe(202)
      })

      describe('and the two remaining batches are sent at the same time', () => {
        let responseA: Response
        let responseB: Response

        beforeEach(async () => {
          // Fire the two remaining content batches concurrently.
          ;[responseA, responseB] = await Promise.all([
            postForm(server, buildPartialForm(deployment, [hashA])),
            postForm(server, buildPartialForm(deployment, [hashB]))
          ])
        })

        it('should respond to each batch with 200 or 202 and finalize exactly one', () => {
          // No 500s: each request either finalizes (200) or reports remaining content (202), and exactly
          // one completes the set.
          expect([responseA.status, responseB.status].every((status) => status === 200 || status === 202)).toBe(true)
          expect([responseA.status, responseB.status]).toContain(200)
        })

        it('should deploy the entity exactly once with no leftover pending row', async () => {
          expect(await countDeployments(server, deployment.entityId)).toBe(1)
          expect(await countPendingDeployments(server)).toBe(0)
        })
      })
    })

    describe('and two identical completing requests race to finalize', () => {
      let deployment: PreparedDeployment
      let hashA: string
      let hashB: string
      let stagingResponse: Response

      beforeEach(async () => {
        // Unique content per test run: storage is content-addressed and survives resetServer.
        const nonce = `${Date.now()}-${Math.random()}`
        deployment = await prepareSceneDeployment(
          ['8,8'],
          {
            'a.txt': Buffer.from(`finalize a ${nonce}`.repeat(50)),
            'b.txt': Buffer.from(`finalize b ${nonce}`.repeat(60))
          },
          identity
        )
        ;[hashA, hashB] = deployment.contentHashes
        // Stage entity + A, leaving only B missing.
        stagingResponse = await postForm(server, buildPartialForm(deployment, [deployment.entityId, hashA]))
      })

      it('should accept the staging request with 202', () => {
        expect(stagingResponse.status).toBe(202)
      })

      describe('and both completing requests are sent at the same time', () => {
        let firstResponse: Response
        let secondResponse: Response

        beforeEach(async () => {
          // Two identical completing requests (both upload B) race to finalize.
          ;[firstResponse, secondResponse] = await Promise.all([
            postForm(server, buildPartialForm(deployment, [hashB])),
            postForm(server, buildPartialForm(deployment, [hashB]))
          ])
        })

        it('should finalize exactly one and respond 200 or 202 to each', () => {
          // Concurrent completing requests race into the deploy pipeline; the deployments unique entity-id
          // constraint plus finalize's pointer-conflict retry mean the winner returns 200 and the other
          // returns 200 (idempotent, if the winner already committed) or 202 (its retries exhausted).
          expect(
            [firstResponse.status, secondResponse.status].every((status) => status === 200 || status === 202)
          ).toBe(true)
          expect([firstResponse.status, secondResponse.status]).toContain(200)
        })

        it('should deploy the entity exactly once with no leftover pending row', async () => {
          expect(await countDeployments(server, deployment.entityId)).toBe(1)
          expect(await countPendingDeployments(server)).toBe(0)
        })
      })
    })
  })

  describe('when uploading across multiple requests (resume fast-path)', () => {
    let deployment: PreparedDeployment
    let hashA: string
    let hashB: string
    let stagingSpy: jest.Mock
    let firstResponse: Response

    beforeEach(async () => {
      // Unique content per test run: storage is content-addressed and survives resetServer.
      const nonce = `${Date.now()}-${Math.random()}`
      deployment = await prepareSceneDeployment(
        ['10,10'],
        { 'a.txt': Buffer.from(`fast path a ${nonce}`), 'b.txt': Buffer.from(`fast path b ${nonce}`) },
        identity
      )
      ;[hashA, hashB] = deployment.contentHashes
      stagingSpy = server.components.validator.validateStagingScene as jest.Mock
      firstResponse = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
    })

    it('should accept the request that creates the pending record with 202', () => {
      expect(firstResponse.status).toBe(202)
    })

    describe('and the first content batch is uploaded', () => {
      let secondResponse: Response

      beforeEach(async () => {
        secondResponse = await postForm(server, buildPartialForm(deployment, [hashA]))
      })

      it('should accept the resume batch with 202', () => {
        expect(secondResponse.status).toBe(202)
      })

      describe('and the last content batch is uploaded', () => {
        let thirdResponse: Response

        beforeEach(async () => {
          thirdResponse = await postForm(server, buildPartialForm(deployment, [hashB]))
        })

        it('should finalize the upload with 200', () => {
          expect(thirdResponse.status).toBe(200)
        })

        it('should run the access check only on the request that creates the pending record', () => {
          // First request creates the pending record with the full staging validation (access included);
          // the two resume batches pass skipAccessCheck (finalize re-runs the full validation separately).
          expect(stagingSpy.mock.calls.map((call) => call[1]?.skipAccessCheck)).toEqual([false, true, true])
        })
      })
    })
  })

  describe('when the deployer loses access to the parcels mid-upload (e.g. the LAND is sold)', () => {
    let deployment: PreparedDeployment
    let originalTtlBackwards: number
    let stagingResponse: Response

    beforeEach(async () => {
      // Unique content per test run: storage is content-addressed and survives resetServer, so reused
      // bytes from a previous test would satisfy the completeness check and auto-finalize early.
      const nonce = `${Date.now()}-${Math.random()}`
      deployment = await prepareSceneDeployment(
        ['11,11'],
        { 'a.txt': Buffer.from(`sold land a ${nonce}`), 'b.txt': Buffer.from(`sold land b ${nonce}`) },
        identity
      )
      originalTtlBackwards = server.components.env.getConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS)

      // Stage the entity and the first file while access is still valid.
      const [hashA] = deployment.contentHashes
      stagingResponse = await postForm(server, buildPartialForm(deployment, [deployment.entityId, hashA]))

      // Make the upload "long-running": shrink the vanilla freshness bound and let the entity age past
      // it, so only the pending-upload TTL anchor lets the finalize through — the exact case where the
      // current-access gate must fire. Then the "sale": the current-access check starts failing.
      server.components.env.setConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS, 500)
      await new Promise((resolve) => setTimeout(resolve, 700))
      ;(server.components.validator.validateCurrentAccess as jest.Mock).mockResolvedValue({
        ok: false,
        errors: ['The provided Eth Address does not have access to the following parcel: (11,11)']
      })
    })

    afterEach(() => {
      server.components.env.setConfig(EnvironmentConfig.REQUEST_TTL_BACKWARDS, originalTtlBackwards)
    })

    it('should accept the staging request sent while access was still valid', () => {
      expect(stagingResponse.status).toBe(202)
    })

    describe('and the completing request is sent after the sale', () => {
      let completingResponse: Response

      beforeEach(async () => {
        const [, hashB] = deployment.contentHashes
        completingResponse = await postForm(server, buildPartialForm(deployment, [hashB]))
      })

      it('should reject the completing request and not deploy the entity', async () => {
        expect(completingResponse.status).toBe(400)
        expect(await countDeployments(server, deployment.entityId)).toBe(0)
      })

      describe('and access is later restored (e.g. the buyer grants operator rights back)', () => {
        let resumeResponse: Response

        beforeEach(async () => {
          ;(server.components.validator.validateCurrentAccess as jest.Mock).mockResolvedValue({ ok: true })

          // All content is already staged; an empty resume request completes the upload.
          resumeResponse = await postForm(server, buildPartialForm(deployment, []))
        })

        it('should finalize the upload and deploy the entity', async () => {
          expect(resumeResponse.status).toBe(200)
          expect(await countDeployments(server, deployment.entityId)).toBe(1)
        })
      })
    })
  })

  describe('when a staging request is rate limited', () => {
    let response: Response

    beforeEach(async () => {
      jest.spyOn(server.components.deployer, 'isRateLimited').mockReturnValue(true)

      const deployment = await prepareSceneDeployment(
        ['9,9'],
        { 'a.txt': Buffer.from('rate limited content') },
        identity
      )
      response = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
    })

    it('should respond 429 (a transient, resumable status) rather than 400', async () => {
      expect(response.status).toBe(429)
      expect(await countPendingDeployments(server)).toBe(0)
    })
  })

  describe('when two partial uploads target the same pointers', () => {
    let older: PreparedDeployment
    let newer: PreparedDeployment

    beforeEach(async () => {
      const nonce = `${Date.now()}-${Math.random()}`
      const now = Date.now()
      older = await prepareSceneDeployment(['5,5'], { 'a.txt': Buffer.from(`older ${nonce}`) }, identity, now - 60_000)
      newer = await prepareSceneDeployment(['5,5'], { 'a.txt': Buffer.from(`newer ${nonce}`) }, identity, now)
    })

    describe('and both are staged', () => {
      let statuses: number[]

      beforeEach(async () => {
        const first = await postForm(server, buildPartialForm(newer, [newer.entityId]))
        const second = await postForm(server, buildPartialForm(older, [older.entityId]))
        statuses = [first.status, second.status]
      })

      it('should accept both uploads with 202', () => {
        expect(statuses).toEqual([202, 202])
      })

      it('should keep both uploads pending without replacing either', async () => {
        expect((await pendingEntityIds(server)).sort()).toEqual([older.entityId, newer.entityId].sort())
      })
    })

    describe('and the newer upload is published before the older one completes', () => {
      let olderCompletion: Response

      beforeEach(async () => {
        await postForm(server, buildPartialForm(older, [older.entityId]))
        await postForm(server, buildPartialForm(newer, [newer.entityId, ...newer.contentHashes]))
        olderCompletion = await postForm(server, buildPartialForm(older, older.contentHashes))
      })

      it('should reject the older completion with 400', () => {
        expect(olderCompletion.status).toBe(400)
      })

      it('should not deploy the older entity', async () => {
        expect(await countDeployments(server, older.entityId)).toBe(0)
      })
    })
  })

  describe('when a batch arrives for an expired upload', () => {
    let response: Response

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(
        ['6,6'],
        { 'a.txt': Buffer.from(`expired ${Date.now()}-${Math.random()}`) },
        identity
      )
      await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      await server.components.database.query(`UPDATE pending_deployments SET created_at = now() - interval '2 days'`)
      response = await postForm(
        server,
        buildPartialForm(deployment, [deployment.entityId, ...deployment.contentHashes])
      )
    })

    it('should reject the batch with 400 and ask for a newly signed entity', async () => {
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 400,
        body: { errors: ['This upload expired. Create a new entity with a fresh timestamp.'] }
      })
    })
  })

  describe('when a contract wallet resumes its upload without the entity file', () => {
    let response: Response

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(
        ['6,6'],
        { 'a.txt': Buffer.from(`contract wallet ${Date.now()}-${Math.random()}`) },
        identity
      )
      // Signed for a contract address: only the provider-backed verifier (stubbed to accept) can validate it.
      const contractChain = Authenticator.createSimpleAuthChain(
        deployment.entityId,
        createIdentity().address,
        Authenticator.createSignature(identity, deployment.entityId)
      )
      const contractDeployment = { ...deployment, authChain: contractChain }
      await postForm(server, buildPartialForm(contractDeployment, [deployment.entityId]))
      response = await postForm(server, buildPartialForm(contractDeployment, deployment.contentHashes))
    })

    it('should validate the signature with the configured verifier and publish the entity', () => {
      expect(response.status).toBe(200)
    })
  })

  describe('when another signer sends a batch without the entity file', () => {
    let response: Response

    beforeEach(async () => {
      const deployment = await prepareSceneDeployment(
        ['7,7'],
        { 'a.txt': Buffer.from(`read back ${Date.now()}-${Math.random()}`) },
        identity
      )
      await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      const otherIdentity = createIdentity()
      const otherSignature = Authenticator.createSignature(otherIdentity, deployment.entityId)
      const otherChain = Authenticator.createSimpleAuthChain(deployment.entityId, otherIdentity.address, otherSignature)
      response = await postForm(
        server,
        buildPartialForm({ ...deployment, authChain: otherChain }, deployment.contentHashes)
      )
    })

    it('should respond with a 400 asking for the entity file', () => {
      expect(response.status).toBe(400)
    })
  })

  describe('when another signer sends a batch with the entity file for a live upload', () => {
    let response: Response
    let body: unknown
    let reservedBefore: string
    let reservedAfter: string

    async function reservedBytes(entityId: string): Promise<string> {
      const result = await server.components.database.query<{ reserved_bytes: string }>(
        `SELECT reserved_bytes FROM pending_deployments WHERE entity_id = '${entityId}'`
      )
      return result.rows[0].reserved_bytes
    }

    beforeEach(async () => {
      const nonce = `${Date.now()}-${Math.random()}`
      const deployment = await prepareSceneDeployment(
        ['8,8'],
        { 'a.txt': Buffer.from(`owned a ${nonce}`), 'b.txt': Buffer.from(`owned b ${nonce}`) },
        identity
      )
      await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      reservedBefore = await reservedBytes(deployment.entityId)
      const otherIdentity = createIdentity()
      const otherSignature = Authenticator.createSignature(otherIdentity, deployment.entityId)
      const otherChain = Authenticator.createSimpleAuthChain(deployment.entityId, otherIdentity.address, otherSignature)
      response = await postForm(
        server,
        buildPartialForm({ ...deployment, authChain: otherChain }, [deployment.entityId, deployment.contentHashes[0]])
      )
      body = await response.json()
      reservedAfter = await reservedBytes(deployment.entityId)
    })

    it('should reject it without charging the upload owner', () => {
      expect({ status: response.status, body, unchanged: reservedAfter === reservedBefore }).toEqual({
        status: 400,
        body: { errors: ['This upload was started by another account.'] },
        unchanged: true
      })
    })
  })

  describe('when recording progress over several batches', () => {
    let inventoryCalls: number[]

    beforeEach(async () => {
      const nonce = `${Date.now()}-${Math.random()}`
      const deployment = await prepareSceneDeployment(
        ['8,8'],
        { 'a.txt': Buffer.from(`progress a ${nonce}`), 'b.txt': Buffer.from(`progress b ${nonce}`) },
        identity
      )
      const metadataSpy = jest.spyOn(server.components.storage, 'fileInfoMultiple')
      inventoryCalls = []
      await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      inventoryCalls.push(metadataSpy.mock.calls.length)
      metadataSpy.mockClear()
      await postForm(server, buildPartialForm(deployment, [deployment.contentHashes[0]]))
      inventoryCalls.push(metadataSpy.mock.calls.length)
    })

    it('should inventory storage on the first batch and not on intermediate ones', () => {
      expect(inventoryCalls).toEqual([1, 0])
    })
  })

  describe('when running the shared partial-deployment contract', () => {
    let deployment: PreparedDeployment

    beforeEach(async () => {
      const nonce = `${Date.now()}-${Math.random()}`
      deployment = await prepareSceneDeployment(
        ['11,11'],
        { 'a.txt': Buffer.from(`contract a ${nonce}`), 'b.txt': Buffer.from(`contract b ${nonce}`) },
        identity
      )
    })

    partialDeploymentContract(() => ({
      entityId: deployment.entityId,
      contentHashes: deployment.contentHashes,
      send: (keys) => postForm(server, buildPartialForm(deployment, keys))
    }))
  })
})
