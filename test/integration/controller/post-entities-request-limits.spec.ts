import { IdentityType } from '@dcl/crypto'
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

const BURST_LIMIT = 2

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

  beforeAll(async () => {
    server = await createDefaultServer({ [EnvironmentConfig.POST_ENTITIES_RATE_LIMIT_MAX]: BURST_LIMIT })
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

  describe('when a partial upload sends more batches than the per-IP burst limit', () => {
    let deployment: PreparedDeployment
    let statuses: number[]

    beforeEach(async () => {
      deployment = await prepareSceneDeployment(['10,10'], uniqueContents(BURST_LIMIT + 2), identity)
      const [firstHash, ...otherHashes] = deployment.contentHashes
      statuses = []
      for (const keys of [[deployment.entityId, firstHash], ...otherHashes.map((hash) => [hash])]) {
        statuses.push((await postForm(server, buildPartialForm(deployment, keys))).status)
      }
    })

    it('should accept every batch and publish on the last one', () => {
      expect(statuses).toEqual([...Array(BURST_LIMIT + 1).fill(202), 200])
    })
  })

  describe('when regular deployments exceed the per-IP burst limit', () => {
    let statuses: number[]

    beforeEach(async () => {
      statuses = []
      for (let i = 0; i <= BURST_LIMIT; i++) {
        const deployment = await prepareSceneDeployment([`${20 + i},20`], uniqueContents(1), identity)
        const keys = [deployment.entityId, ...deployment.contentHashes]
        statuses.push((await postForm(server, buildPartialForm(deployment, keys, false))).status)
      }
    })

    it('should rate limit the deployment past the limit', () => {
      expect(statuses).toEqual([...Array(BURST_LIMIT).fill(200), 429])
    })
  })
})
