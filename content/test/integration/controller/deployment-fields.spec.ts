import { createFetchComponent } from '@well-known-components/fetch-component'
import { DeploymentField } from '../../../src/types'
import { Deployment } from '../../../src/deployment-types'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { buildDeployData } from '../E2ETestUtils'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'
import LeakDetector from 'jest-leak-detector'

describe('Integration - Deployment Fields', () => {
  const fetcher = createFetchComponent()
  const jsonFetcher = {
    ...fetcher,
    async fetchJson(url: string) {
      return (await fetcher.fetch(url)).json()
    }
  }

  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
    makeNoopValidator(server.components)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    const detector = new LeakDetector(server)
    await server.stopProgram()
    server = null as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it('When deployments fields filter is used, then the result is the expected', async () => {
    const { deployData } = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'this is just some metadata' },
      contentPaths: ['test/integration/resources/some-binary-file.png']
    })

    // Deploy entity
    await server.deployEntity(deployData)

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
    if (check.content) expect(deployment.content).toBeDefined()
    if (opts.metadata) expect(deployment.metadata).toBeDefined()
    else expect(deployment.metadata).toBeUndefined()
    if (opts.pointers) expect(deployment.pointers).toBeDefined()
    else expect(deployment.pointers).toBeUndefined()
  }

  async function fetchDeployment(...fields: DeploymentField[]): Promise<Partial<Deployment>> {
    const url = server.getUrl() + `/deployments?fields=` + fields.join(',')
    const { deployments } = (await jsonFetcher.fetchJson(url)) as { deployments: any }
    return deployments[0]
  }
})
