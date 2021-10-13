import { Deployment, Fetcher } from 'dcl-catalyst-commons'
import { DeploymentField } from '../../../src/controller/Controller'
import { Bean } from '../../../src/Environment'
import { MockedSynchronizationManager } from '../../helpers/service/synchronization/MockedSynchronizationManager'
import { loadStandaloneTestEnvironment } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { TestServer } from '../TestServer'

describe('Integration - Deployment Fields', () => {
  const testEnv = loadStandaloneTestEnvironment()
  let server: TestServer
  const fetcher = new Fetcher()

  beforeEach(async () => {
    server = await testEnv
      .configServer()
      .withBean(Bean.SYNCHRONIZATION_MANAGER, new MockedSynchronizationManager())
      .andBuild()
    await server.start()
  })

  it('When deployments fields filter is used, then the result is the expected', async () => {
    const { deployData } = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    // Deploy entity
    await server.deploy(deployData)

    // Fetch deployments
    const withAudit = await fetchDeployment(DeploymentField.AUDIT_INFO)
    const withContent = await fetchDeployment(DeploymentField.CONTENT)
    const withPointers = await fetchDeployment(DeploymentField.POINTERS)
    const withMetadata = await fetchDeployment(DeploymentField.METADATA)
    const withAll = await fetchDeployment(
      DeploymentField.AUDIT_INFO,
      DeploymentField.CONTENT,
      DeploymentField.POINTERS,
      DeploymentField.METADATA
    )
    const nothing = await fetchDeployment()

    // Assert filters
    assert(withAudit, { auditInfo: true })
    assert(withContent, { content: true })
    assert(withPointers, { pointers: true })
    assert(withMetadata, { metadata: true })
    assert(withAll, { auditInfo: true, content: true, metadata: true, pointers: true })
    assert(nothing, { content: true, metadata: true, pointers: true })
  })

  function assert(
    deployment: Partial<Deployment>,
    check: { auditInfo?: boolean; metadata?: boolean; content?: boolean; pointers?: boolean }
  ) {
    const opts = Object.assign({ auditInfo: false, metadata: false, content: false, pointers: false }, check)
    expect(deployment.entityType).toBeDefined()
    expect(deployment.entityId).toBeDefined()
    expect(deployment.entityTimestamp).toBeDefined()
    expect(deployment.deployedBy).toBeDefined()

    if (opts.auditInfo) expect(deployment.auditInfo).toBeDefined()
    else expect(deployment.auditInfo).toBeUndefined()
    if (opts.content) expect(deployment.content).toBeDefined()
    else expect(deployment.content).toBeUndefined()
    if (opts.metadata) expect(deployment.metadata).toBeDefined()
    else expect(deployment.metadata).toBeUndefined()
    if (opts.pointers) expect(deployment.pointers).toBeDefined()
    else expect(deployment.pointers).toBeUndefined()
  }

  async function fetchDeployment(...fields: DeploymentField[]): Promise<Partial<Deployment>> {
    const url = server.getAddress() + `/deployments?fields=` + fields.join(',')
    const { deployments } = (await fetcher.fetchJson(url)) as { deployments: any }
    return deployments[0]
  }
})
