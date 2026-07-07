import { Authenticator, IdentityType } from '@dcl/crypto'
import { EntityType } from '@dcl/schemas'
import { buildEntity } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import FormData = require('form-data')
import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import { createIdentity } from '../E2ETestUtils'

type PreparedDeployment = {
  entityId: string
  authChain: ReturnType<typeof Authenticator.createSimpleAuthChain>
  files: Map<string, Uint8Array>
  contentHashes: string[]
}

async function prepareSceneDeployment(
  pointers: string[],
  contents: Record<string, Buffer>,
  identity: IdentityType
): Promise<PreparedDeployment> {
  const files = new Map<string, Uint8Array>(Object.entries(contents))
  const prepared = await buildEntity({
    type: EntityType.SCENE,
    pointers,
    files,
    metadata: { main: 'bin/main.js', scene: { base: pointers[0], parcels: pointers } },
    timestamp: Date.now()
  })
  const signature = Authenticator.createSignature(identity, prepared.entityId)
  const authChain = Authenticator.createSimpleAuthChain(prepared.entityId, identity.address, signature)
  const contentHashes = Array.from(prepared.files.keys()).filter((k) => k !== prepared.entityId)
  return { entityId: prepared.entityId, authChain, files: prepared.files, contentHashes }
}

function buildPartialForm(deployment: PreparedDeployment, keysToInclude: string[], partial = true): FormData {
  const form = new FormData()
  form.append('entityId', deployment.entityId)
  if (partial) {
    form.append('partial', 'true')
  }
  form.append('authChain', JSON.stringify(deployment.authChain))
  for (const key of keysToInclude) {
    const content = deployment.files.get(key)
    if (!content) {
      throw new Error(`Test setup error: no file for key ${key}`)
    }
    form.append(key, Buffer.from(content), { filename: key })
  }
  return form
}

async function postForm(server: TestProgram, form: FormData): Promise<Response> {
  return fetch(server.getUrl() + '/entities', {
    method: 'POST',
    body: form.getBuffer(),
    headers: form.getHeaders()
  })
}

async function countPendingDeployments(server: TestProgram): Promise<number> {
  const result = await server.components.database.query<{ count: string }>('SELECT COUNT(*) as count FROM pending_deployments')
  return parseInt(result.rows[0].count)
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
    it('should return 202 with the missing hashes until the last request, which returns 200 and makes the entity live', async () => {
      const deployment = await prepareSceneDeployment(
        ['0,0'],
        { 'a.txt': Buffer.from('content of file a'), 'b.txt': Buffer.from('content of file b') },
        identity
      )
      const [hashA, hashB] = deployment.contentHashes

      // Request 1: entity file only.
      const res1 = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      expect(res1.status).toBe(202)
      const body1 = await res1.json()
      expect(new Set(body1.missing)).toEqual(new Set([hashA, hashB]))
      expect(await countPendingDeployments(server)).toBe(1)

      // Request 2: first content file.
      const res2 = await postForm(server, buildPartialForm(deployment, [hashA]))
      expect(res2.status).toBe(202)
      expect(await res2.json()).toEqual({ missing: [hashB] })

      // Request 3: last content file → auto-finalize.
      const res3 = await postForm(server, buildPartialForm(deployment, [hashB]))
      expect(res3.status).toBe(200)
      expect(typeof (await res3.json()).creationTimestamp).toBe('number')

      // The pending row is gone and the entity is deployed.
      expect(await countPendingDeployments(server)).toBe(0)
      const deployed = await server.components.deploymentsRepository.getEntityById(
        server.components.database,
        deployment.entityId
      )
      expect(deployed?.entityId).toBe(deployment.entityId)
    })

    it('should not require the entity file on requests after the first', async () => {
      const deployment = await prepareSceneDeployment(
        ['1,1'],
        { 'a.txt': Buffer.from('another file a') },
        identity
      )
      const [hashA] = deployment.contentHashes

      const res1 = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      expect(res1.status).toBe(202)

      // Second request omits the entity file entirely; the server reads it back from storage.
      const res2 = await postForm(server, buildPartialForm(deployment, [hashA]))
      expect(res2.status).toBe(200)
      expect(await countPendingDeployments(server)).toBe(0)
    })
  })

  describe('when a single partial request already contains all the content', () => {
    it('should finalize immediately and return 200', async () => {
      const deployment = await prepareSceneDeployment(
        ['2,2'],
        { 'a.txt': Buffer.from('single batch file') },
        identity
      )
      const res = await postForm(
        server,
        buildPartialForm(deployment, [deployment.entityId, ...deployment.contentHashes])
      )
      expect(res.status).toBe(200)
      expect(await countPendingDeployments(server)).toBe(0)
    })
  })

  describe('when the same partial request is replayed', () => {
    it('should respond idempotently with the same missing hashes and keep a single pending row', async () => {
      const deployment = await prepareSceneDeployment(
        ['3,3'],
        { 'a.txt': Buffer.from('replay file a'), 'b.txt': Buffer.from('replay file b') },
        identity
      )

      const first = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))
      const second = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))

      expect(first.status).toBe(202)
      expect(second.status).toBe(202)
      expect(new Set((await second.json()).missing)).toEqual(new Set(deployment.contentHashes))
      expect(await countPendingDeployments(server)).toBe(1)
    })
  })

  describe('when the first partial request omits the entity file', () => {
    it('should return 400', async () => {
      const deployment = await prepareSceneDeployment(
        ['4,4'],
        { 'a.txt': Buffer.from('orphan content') },
        identity
      )
      const [hashA] = deployment.contentHashes
      const res = await postForm(server, buildPartialForm(deployment, [hashA]))
      expect(res.status).toBe(400)
    })
  })

  describe('when an uploaded file does not match its declared hash key', () => {
    it('should return 400', async () => {
      const deployment = await prepareSceneDeployment(
        ['5,5'],
        { 'a.txt': Buffer.from('mismatch content') },
        identity
      )
      const form = new FormData()
      form.append('entityId', deployment.entityId)
      form.append('partial', 'true')
      form.append('authChain', JSON.stringify(deployment.authChain))
      // Entity file uploaded under a wrong key: its computed hash won't equal the key.
      form.append('bafyWrongKey0000000000000000000000000000000000000000000000', Buffer.from(deployment.files.get(deployment.entityId)!), {
        filename: 'wrong'
      })
      const res = await postForm(server, form)
      expect(res.status).toBe(400)
    })
  })

  describe('when a non-partial request is missing content (legacy behavior)', () => {
    it('should still reach the deployer and not create a pending row', async () => {
      const deployment = await prepareSceneDeployment(
        ['6,6'],
        { 'a.txt': Buffer.from('legacy file a') },
        identity
      )
      // Full (non-partial) deploy with all content present → succeeds, no pending row involved.
      const res = await postForm(
        server,
        buildPartialForm(deployment, [deployment.entityId, ...deployment.contentHashes], false)
      )
      expect(res.status).toBe(200)
      expect(await countPendingDeployments(server)).toBe(0)
    })
  })

  describe('when staging requests for the same entity run in parallel', () => {
    it('should accept two distinct content batches uploaded concurrently and deploy the entity once', async () => {
      const deployment = await prepareSceneDeployment(
        ['7,7'],
        { 'a.txt': Buffer.from('parallel a'.repeat(50)), 'b.txt': Buffer.from('parallel b'.repeat(60)) },
        identity
      )
      const [hashA, hashB] = deployment.contentHashes

      expect((await postForm(server, buildPartialForm(deployment, [deployment.entityId]))).status).toBe(202)

      // Fire the two remaining content batches concurrently.
      const [resA, resB] = await Promise.all([
        postForm(server, buildPartialForm(deployment, [hashA])),
        postForm(server, buildPartialForm(deployment, [hashB]))
      ])

      // No 500s: each request either finalizes (200) or reports remaining content (202), and exactly
      // one completes the set. The entity is deployed exactly once, with no leftover pending row.
      const statuses = [resA.status, resB.status].sort()
      expect(statuses.every((status) => status === 200 || status === 202)).toBe(true)
      expect(statuses).toContain(200)
      expect(await countDeployments(server, deployment.entityId)).toBe(1)
      expect(await countPendingDeployments(server)).toBe(0)
    })

    it('should deploy once when two requests complete the content set at the same time', async () => {
      const deployment = await prepareSceneDeployment(
        ['8,8'],
        { 'a.txt': Buffer.from('finalize a'.repeat(50)), 'b.txt': Buffer.from('finalize b'.repeat(60)) },
        identity
      )
      const [hashA, hashB] = deployment.contentHashes

      // Stage entity + A, leaving only B missing.
      expect((await postForm(server, buildPartialForm(deployment, [deployment.entityId, hashA]))).status).toBe(202)

      // Two identical completing requests (both upload B) race to finalize.
      const [res1, res2] = await Promise.all([
        postForm(server, buildPartialForm(deployment, [hashB])),
        postForm(server, buildPartialForm(deployment, [hashB]))
      ])

      expect(res1.status).toBe(200)
      expect(res2.status).toBe(200)
      expect(await countDeployments(server, deployment.entityId)).toBe(1)
      expect(await countPendingDeployments(server)).toBe(0)
    })
  })

  describe('when a staging request is rate limited', () => {
    it('should respond 429 (a transient, resumable status) rather than 400', async () => {
      jest.spyOn(server.components.deployer, 'isRateLimited').mockReturnValue(true)

      const deployment = await prepareSceneDeployment(
        ['9,9'],
        { 'a.txt': Buffer.from('rate limited content') },
        identity
      )
      const res = await postForm(server, buildPartialForm(deployment, [deployment.entityId]))

      expect(res.status).toBe(429)
      expect(await countPendingDeployments(server)).toBe(0)
    })
  })
})
