import { EnvironmentConfig } from '../../../src/Environment'
import { assertPromiseIsRejected } from '../../helpers/PromiseAssertions'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData, createIdentity } from '../E2ETestUtils'
import { TestProgram } from '../TestProgram'

loadStandaloneTestEnvironment()('Integration - DeactivatedDenylist', (testEnv) => {
  const decentralandIdentity = createIdentity()
  let server: TestProgram

  beforeEach(async () => {
    server = await testEnv
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .withConfig(EnvironmentConfig.DISABLE_DENYLIST, true)
      .andBuild()

    makeNoopValidator(server.components)

    await server.startProgram()
  })

  it(`When an entity is denylisted, then an error is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'])

    // Deploy the entity
    await server.deploy(deployData)

    // Denylist the entity
    await assertPromiseIsRejected(() => server.denylistEntity(entityBeingDeployed, decentralandIdentity))
  })

  it(`When an entity is undenylisted, then it fails`, async () => {
    // Prepare entity to deploy
    const { deployData, controllerEntity: entityBeingDeployed } = await buildDeployData(['0,0', '0,1'])

    // Deploy the entity
    await server.deploy(deployData)

    // Undenylist the entity
    await assertPromiseIsRejected(() => server.undenylistEntity(entityBeingDeployed, decentralandIdentity))
  })

  it(`When getting denylistedTargets, then it is empty`, async () => {
    // Prepare entity to deploy
    const { deployData } = await buildDeployData(['0,0', '0,1'])

    // Deploy the entity
    await server.deploy(deployData)

    expect(await server.getDenylistTargets()).toEqual([])
  })
})
