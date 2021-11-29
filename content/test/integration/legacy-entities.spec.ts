import { addModelToFormData, DeploymentData } from 'dcl-catalyst-client'
import { ContentFileHash } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { Bean, EnvironmentConfig } from '../../src/Environment'
import { assertPromiseRejectionIs } from '../helpers/PromiseAssertions'
import { MockedSynchronizationManager } from '../helpers/service/synchronization/MockedSynchronizationManager'
import { assertResponseIsOkOrThrow } from './E2EAssertions'
import { loadStandaloneTestEnvironment } from './E2ETestEnvironment'
import { buildDeployData, createIdentity } from './E2ETestUtils'
import { TestServer } from './TestServer'

describe('End 2 end - Legacy Entities', () => {
  const identity = createIdentity()
  const testEnv = loadStandaloneTestEnvironment()
  let server: TestServer

  beforeEach(async () => {
    server = await testEnv
      .configServer()
      .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
      .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, identity.address)
      .withConfig(EnvironmentConfig.ALLOW_LEGACY_ENTITIES, true)
      .andBuild()
    await server.start()
  })

  it(`When a non-decentraland address tries to deploy a legacy entity, then an exception is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData } = await buildDeployData(['0,0', '0,1'], { metadata: 'metadata', identity: createIdentity() })

    // Try to deploy the entity
    await assertPromiseRejectionIs(
      () => deployLegacy(server, deployData),
      `Expected an address owned by decentraland. Instead, we found ${Authenticator.ownerAddress(deployData.authChain)}`
    )
  })

  it(`When a decentraland address tries to deploy a legacy entity, then it is successful`, async () => {
    // Prepare entity to deploy
    const { deployData } = await buildDeployData(['0,0', '0,1'], { metadata: 'metadata', identity })

    // Deploy the entity
    await deployLegacy(server, deployData)
  })

  it(`When a user tries to deploy a legacy entity over an entity with a higher version, then an error is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData: deployData1 } = await buildDeployData(['0,0', '0,1'], { metadata: 'metadata', identity })

    // Deploy entity with current version
    await server.deploy(deployData1)

    // Prepare new entity to deploy
    const { deployData: deployData2 } = await buildDeployData(['0,1'], { metadata: 'metadata', identity })

    // Deploy the entity
    await assertPromiseRejectionIs(
      () => deployLegacy(server, deployData2),
      'Found an overlapping entity with a higher version already deployed.'
    )
  })
})

async function deployLegacy(server: TestServer, deployData: DeploymentData) {
  const form = new FormData()
  form.append('entityId', deployData.entityId)
  addModelToFormData(deployData.authChain, form, 'authChain')
  form.append('version', 'v2')
  form.append('migration_data', JSON.stringify({ data: 'data' }))

  deployData.files.forEach((f: Buffer | Uint8Array, hash: ContentFileHash) =>
    form.append(hash, Buffer.isBuffer(f) ? f : Buffer.from(arrayBufferFrom(f)), { filename: hash })
  )

  const deployResponse = await fetch(`${server.getAddress()}/legacy-entities`, { method: 'POST', body: form })
  await assertResponseIsOkOrThrow(deployResponse)
}

function arrayBufferFrom(value: Buffer | Uint8Array) {
  if (value.buffer) {
    return value.buffer
  }
  return value
}
