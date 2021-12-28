import { addModelToFormData, DeploymentData } from 'dcl-catalyst-client'
import { ContentFileHash } from 'dcl-catalyst-commons'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../src/Environment'
import { assertPromiseRejectionIs } from '../helpers/PromiseAssertions'
import { makeNoopSynchronizationManager } from '../helpers/service/synchronization/MockedSynchronizationManager'
import { assertResponseIsOkOrThrow } from './E2EAssertions'
import { loadStandaloneTestEnvironment } from './E2ETestEnvironment'
import { buildDeployData, createIdentity } from './E2ETestUtils'
import { TestProgram } from './TestProgram'

loadStandaloneTestEnvironment()('End 2 end - Legacy Entities', (testEnv) => {
  const identity = createIdentity()
  let server: TestProgram

  beforeEach(async () => {
    server = await testEnv
      .configServer()
      .withConfig(EnvironmentConfig.DECENTRALAND_ADDRESS, identity.address)
      .andBuild()
    makeNoopSynchronizationManager(server.components.synchronizationManager)
    await server.startProgram()
  })

  it(`When a non-decentraland address tries to deploy a legacy entity, then an exception is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData } = await buildDeployData(['0,0', '0,1'], { metadata: 'metadata', identity: createIdentity() })

    // Try to deploy the entity
    await assertPromiseRejectionIs(
      () => deployLegacy(server, deployData),
      '{"errors":["The provided Eth Address does not have access to the following parcel: (0,0)","The provided Eth Address does not have access to the following parcel: (0,1)"]}'
    )
  })

  it(`When a decentraland address tries to deploy a legacy entity with new timestamp, then an exception is thrown`, async () => {
    // Prepare entity to deploy
    const { deployData } = await buildDeployData(['0,0', '0,1'], { metadata: 'metadata', identity })

    // Try to deploy the entity
    await assertPromiseRejectionIs(
      () => deployLegacy(server, deployData),
      '{"errors":["The provided Eth Address does not have access to the following parcel: (0,0)","The provided Eth Address does not have access to the following parcel: (0,1)"]}'
    )
  })

  it(`When a decentraland address tries to deploy a legacy entity with old timestamp, then it is successful`, async () => {
    // Prepare entity to deploy
    const { deployData } = await buildDeployData(['0,0', '0,1'], { metadata: 'metadata', identity, timestamp: 1500000000000 })

    // Deploy the entity
    await deployLegacy(server, deployData)
  })
})

async function deployLegacy(server: TestProgram, deployData: DeploymentData) {
  const form = new FormData()
  form.append('entityId', deployData.entityId)
  addModelToFormData(deployData.authChain, form, 'authChain')
  form.append('version', 'v2')
  form.append('migration_data', JSON.stringify({ data: 'data' }))

  deployData.files.forEach((f: Buffer | Uint8Array, hash: ContentFileHash) =>
    form.append(hash, Buffer.isBuffer(f) ? f : Buffer.from(arrayBufferFrom(f)), { filename: hash })
  )

  const deployResponse = await fetch(`${server.getUrl()}/entities`, { method: 'POST', body: form })
  await assertResponseIsOkOrThrow(deployResponse)
}

function arrayBufferFrom(value: Buffer | Uint8Array) {
  if (value.buffer) {
    return value.buffer
  }
  return value
}
