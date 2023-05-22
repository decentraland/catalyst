import { Entity } from '@dcl/schemas'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { DeploymentData } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import fetch from 'node-fetch'
import { makeNoopValidator } from '../helpers/service/validations/NoOpValidator'
import { assertDeploymentsAreReported, buildDeployment } from './E2EAssertions'
import { setupTestEnvironment } from './E2ETestEnvironment'
import { buildDeployData } from './E2ETestUtils'
import { getIntegrationResourcePathFor } from './resources/get-resource-path'
import { TestProgram } from './TestProgram'

describe('End 2 end deploy test', () => {
  const getTestEnv = setupTestEnvironment()

  let server: TestProgram
  const POINTER0 = 'X0,Y0'
  const POINTER1 = 'X1,Y1'

  beforeEach(async () => {
    server = await getTestEnv().configServer().andBuild()
    makeNoopValidator(server.components)
    await server.startProgram()
  })

  it('When a user tries to deploy the same entity twice, then an exception is thrown', async () => {
    // Build data for deployment
    const { deployData } = await buildDeployData([POINTER0, POINTER1], {
      metadata: { a: 'this is just some metadata"' }
    })

    // Execute first deploy
    const ret1 = await server.deployEntity(deployData)

    await sleep(100)

    const ret2 = await server.deployEntity(deployData)

    // Try to re deploy, and don't fail since it is an idempotent operation
    expect(ret1).toEqual(ret2)
  })

  it(`Deploy and retrieve some content`, async () => {
    //------------------------------
    // Deploy the content
    //------------------------------
    const { deployData, entity: entityBeingDeployed } = await buildDeployData([POINTER0, POINTER1], {
      metadata: { a: 'this is just some metadata' },
      contentPaths: [
        getIntegrationResourcePathFor('some-binary-file.png'),
        getIntegrationResourcePathFor('some-text-file.txt')
      ]
    })

    const creationTimestamp = await server.deployEntity(deployData)
    const deployment = buildDeployment(deployData, entityBeingDeployed, creationTimestamp)
    const deltaTimestamp = Date.now() - creationTimestamp
    expect(deltaTimestamp).toBeLessThanOrEqual(100)
    expect(deltaTimestamp).toBeGreaterThanOrEqual(0)

    //------------------------------
    // Retrieve the entity by id
    //------------------------------
    const scenesById: Entity[] = await server.getEntitiesByIds(deployData.entityId)

    await validateReceivedData(scenesById, deployData)

    //------------------------------
    // Retrieve the entity by pointer
    //------------------------------
    const scenesByPointer: Entity[] = await server.getEntitiesByPointers([POINTER0])
    await validateReceivedData(scenesByPointer, deployData)

    await assertDeploymentsAreReported(server, deployment)
  })

  async function validateReceivedData(receivedScenes: Entity[], deployData: DeploymentData) {
    expect(receivedScenes.length).toBe(1)
    const scene: Entity = receivedScenes[0]
    expect(scene.id).toBe(deployData.entityId)
    expect(scene.metadata).toEqual({ a: 'this is just some metadata' })

    expect(scene.pointers.length).toBe(2)
    expect(equalsCaseInsensitive(scene.pointers[0], POINTER0)).toBeTruthy()
    expect(equalsCaseInsensitive(scene.pointers[1], POINTER1)).toBeTruthy()

    expect(scene.content).toBeDefined()
    expect(scene.content!.length).toBe(2)

    for (const contentElement of scene.content!) {
      const downloadedContent = await server.downloadContent(contentElement.hash)
      const headResponse = await fetch(`${server.getUrl()}/contents/${contentElement.hash}`, { method: 'HEAD' })
      expect(headResponse.ok).toBeTruthy()

      expect(downloadedContent).toEqual(deployData.files.get(contentElement.hash)!)
    }
  }
})

function equalsCaseInsensitive(text1: string, text2: string): boolean {
  return text1.toLowerCase() === text2.toLowerCase()
}
