import { Entity } from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { TestProgram } from '../TestProgram'

loadStandaloneTestEnvironment()('Integration - Get Active Entities', (testEnv) => {
  it('When asking by ID, it returns active entities with given ID', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    // Deploy entity
    await server.deploy(deployResult.deployData)

    const result = await fetchActiveEntityByIds(server, deployResult.entity.id)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(deployResult.entity.id)
  })

  it('When asking by Pointer, it returns active entities with given pointer', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    // Deploy entity
    await server.deploy(deployResult.deployData)

    const result = await fetchActiveEntityByPointers(server, ...deployResult.entity.pointers)

    expect(result).toHaveLength(1)
    expect(result[0].pointers).toContain(deployResult.entity.pointers[0])
    expect(result[0].pointers).toContain(deployResult.entity.pointers[1])
  })

  async function fetchActiveEntityByIds(server: TestProgram, ...ids: string[]): Promise<Entity[]> {
    const url = server.getUrl() + `/entities/active`

    return (
      await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ ids }),
        headers: { 'Content-Type': 'application/json' }
      })
    ).json()
  }

  async function fetchActiveEntityByPointers(server: TestProgram, ...pointers: string[]): Promise<Entity[]> {
    const url = server.getUrl() + `/entities/active`

    return (
      await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ pointers }),
        headers: { 'Content-Type': 'application/json' }
      })
    ).json()
  }
})
