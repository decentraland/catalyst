import { EntityType } from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../../src/Environment'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData, deployEntitiesCombo } from '../E2ETestUtils'

loadStandaloneTestEnvironment()('Integration - Audit', (testEnv) => {
  it('returns the audit information about the entity', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const entity = await buildDeployData(['profileId'], { type: EntityType.PROFILE })
    await deployEntitiesCombo(server.components.deployer, entity)

    const url = server.getUrl() + `/audit/profile/${entity.entity.id}`
    const res = await fetch(url)

    expect(res.status).toBe(200)
  })

  it('returns 400 when the entity type is invalid', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/audit/non-existent-type/non-existent-entity`
    const res = await fetch(url)

    expect(res.status).toBe(400)
  })

  it('returns 404 when it cannot find the entity', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()

    const url = server.getUrl() + `/audit/profile/non-existent-entity`
    const res = await fetch(url)

    expect(res.status).toBe(404)
  })
})
