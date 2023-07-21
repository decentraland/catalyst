import fetch from 'node-fetch'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { buildDeployData } from '../E2ETestUtils'
import { createDefaultServer, resetServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Get Active Entities By Content Hash', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  beforeEach(async () => {
    resetServer(server)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it("When the deployment doesn't exist returns 404", async () => {
    const response = await fetch(server.getUrl() + `/contents/fail/active-entities`)

    expect(response.status).toEqual(404)
    expect(response.ok).toBe(false)

    const body = await response.json()
    expect(body.error).toBe('The entity was not found')
  })

  it('When the deployment exists returns the entity id', async () => {
    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'this is just some metadata' },
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    const secondDeployResult = await buildDeployData(['0,3', '0,2'], {
      metadata: { a: 'this is just some metadata' },
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    // Deploy entity
    await server.deployEntity(deployResult.deployData)
    await server.deployEntity(secondDeployResult.deployData)

    const result = await fetchActiveEntity(
      server,
      deployResult.entity.content?.find(({ file }) => file === 'some-binary-file.png')?.hash ?? ''
    )

    expect(result).toEqual([deployResult.entity.id, secondDeployResult.entity.id])
  })

  async function fetchActiveEntity(server: TestProgram, contentHash: string): Promise<string[]> {
    const url = server.getUrl() + `/contents/${contentHash}/active-entities`

    return (await fetch(url)).json()
  }
})
