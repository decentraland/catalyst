import { DeploymentData } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/logic/server-validator/NoOpValidator'
import { buildDeployData } from '../E2ETestUtils'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'

/**
 * Posts a deployment the way the client does, but returns the raw response so a test can read the
 * status and the headers. `TestProgram.deployEntity` throws on anything not ok, which hides both.
 */
async function postEntity(server: TestProgram, deployData: DeploymentData): Promise<Response> {
  const form = new FormData()
  form.append('entityId', deployData.entityId)
  form.append('authChain', JSON.stringify(deployData.authChain))
  for (const [name, content] of deployData.files) {
    form.append(name, new Blob([content]), name)
  }
  return fetch(`${server.getUrl()}/entities`, { method: 'POST', body: form })
}

/** Fresh pointers per deploy, so the per-pointer deploy rate limit never confuses the result. */
async function postScenes(server: TestProgram, count: number): Promise<Response[]> {
  const responses: Response[] = []
  for (let index = 1; index <= count; index++) {
    const { deployData } = await buildDeployData([`${index},${index}`], { metadata: { index } })
    responses.push(await postEntity(server, deployData))
  }
  return responses
}

/**
 * A server per test rather than per file: the quota is counted per running process, so a shared server
 * would carry one test's spent budget into the next and every test after the first would pass — or
 * fail — for reasons of its own.
 *
 * No `LeakDetector` assertion in the teardown, unlike the sibling specs: it needs the only reference to
 * the server dropped before it measures, which a per-test server cannot promise. The sibling specs
 * already cover this server's shutdown for leaks once per file, which is what that check is for.
 */
async function startServer(overrides: Record<number, any>): Promise<TestProgram> {
  const server = await createDefaultServer({
    [EnvironmentConfig.DISABLE_SYNCHRONIZATION]: true,
    ...overrides
  })
  makeNoopValidator(server.components)
  return server
}

describe('Integration - Deployment quota', () => {
  let server: TestProgram

  afterEach(async () => {
    jest.restoreAllMocks()
    await server.stopProgram()
    server = null as any
  })

  describe('when a client has a budget of two scene deployments per minute', () => {
    let responses: Response[]

    beforeEach(async () => {
      server = await startServer({ [EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE]: 2 })
      responses = await postScenes(server, 3)
    })

    it('should accept the deployments that fit the budget and reject the one past it', () => {
      expect(responses.map((response) => response.status)).toEqual([200, 200, 429])
    })
  })

  describe('and the rejected client reads the response', () => {
    let rejection: Response
    let body: unknown
    let retryAfter: string | null

    beforeEach(async () => {
      server = await startServer({ [EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE]: 1 })
      rejection = (await postScenes(server, 2))[1]
      retryAfter = rejection.headers.get('retry-after')
      body = await rejection.json()
    })

    it('should be told when to come back', () => {
      expect(Number(retryAfter)).toBeGreaterThan(0)
    })

    it('should get the error body the rest of the API uses', () => {
      expect(body).toEqual({ error: expect.stringContaining('Too many deployments from this address') })
    })

    it('should not be told which budget or window it hit', () => {
      expect(JSON.stringify(body)).not.toContain('minute')
    })
  })

  describe('and a deployment of another entity type follows a scene rejection', () => {
    let responses: Response[]
    let profileResponse: Response

    beforeEach(async () => {
      server = await startServer({ [EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE]: 1 })
      responses = await postScenes(server, 2)
      const { deployData } = await buildDeployData(['0x1337e0507eb4ab47e08a179573ed4533d9e22a7b'], {
        type: 'profile',
        metadata: { profile: true }
      } as any)
      profileResponse = await postEntity(server, deployData)
    })

    it('should have rejected the second scene', () => {
      expect(responses[1].status).toBe(429)
    })

    it('should accept the profile, since the budgets are held per entity type', () => {
      expect(profileResponse.status).toBe(200)
    })
  })

  describe('when the client address is exempt', () => {
    let responses: Response[]

    beforeEach(async () => {
      server = await startServer({
        [EnvironmentConfig.DEPLOYMENT_QUOTA_MAX_PER_MINUTE]: 1,
        [EnvironmentConfig.DEPLOYMENT_QUOTA_EXEMPT_IPS]: ['127.0.0.1', '::1']
      })
      responses = await postScenes(server, 3)
    })

    it('should accept every deployment, consuming no budget', () => {
      expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    })
  })
})
