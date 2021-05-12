import { Bean } from '@katalyst/content/Environment'
import { MockedSynchronizationManager } from '@katalyst/test-helpers/service/synchronization/MockedSynchronizationManager'
// import { Fetcher } from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { TestServer } from '../TestServer'

fdescribe('Integration - Get Active Entity By Content Hash', () => {
  const testEnv = loadStandaloneTestEnvironment()
  let server: TestServer
  // const fetcher = new Fetcher()

  beforeEach(async () => {
    server = await testEnv
      .configServer()
      .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
      .andBuild()
    await server.start()
  })

  it("When the deployment doesn't exist returns 404", async () => {
    const response = await fetch(server.getAddress() + `/contents/fail/active-entity`)

    expect(response.status).toEqual(404)
    expect(response.ok).toBe(false)

    const body = await response.json()
    expect(body.error).toBe('The entity was not found')
  })

  // it('When the deployment exists returns the entity id', async () => {
  //   const { deployData } = await buildDeployData(['0,0', '0,1'], {
  //     metadata: 'this is just some metadata',
  //     contentPaths: ['content/test/integration/resources/some-binary-file.png']
  //   })

  //   // Deploy entity
  //   await server.deploy(deployData)

  //   await fetchActiveEntity("asd")
  //   // exp
  // })
  // const testEnv = loadStandaloneTestEnvironment()
  // let server: TestServer
  // const fetcher = new Fetcher()

  // beforeAll(async () => {
  //   server = await testEnv
  //     .configServer()
  //     .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
  //     .andBuild()
  //   await server.start()
  // })

  // it(`When garbage collection is on, then unused content is deleted`, async () => {
  //   const { deployData } = await buildDeployData(['0,0', '0,1'], {
  //     metadata: 'this is just some metadata',
  //     contentPaths: ['content/test/integration/resources/some-binary-file.png']
  //   })

  //   // Deploy entity
  //   await server.deploy(deployData)

  //   // Fetch deployments
  //   await fetchActiveEntity("")

  //   expect(true).toBe(false);
  // })

  // async function fetchActiveEntity(contentHash: string): Promise<EntityByHash> {
  //   const url = server.getAddress() + `/contents/${contentHash}/active-entity`
  //   console.log(url)
  //   return fetcher.fetchJson(url)
  // }
})
