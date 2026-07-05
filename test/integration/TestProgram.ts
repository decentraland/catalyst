import { setTimeout as sleep } from 'timers/promises'
import { Entity } from '@dcl/schemas'
import { ILoggerComponent, Lifecycle } from '@well-known-components/interfaces'
import { createFetchComponent } from '@dcl/fetch-component'
import { ContentClient, createContentClient } from 'dcl-catalyst-client/dist/client/ContentClient'
import { DeploymentData } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import { EnvironmentConfig } from '../../src/Environment'
import { AuditInfo, Deployment, DeploymentOptions, isInvalidDeployment } from '../../src/deployment-types'
import { getDeployments } from '../../src/logic/deployments'
import { FailedDeployment } from '../../src/adapters/failed-deployments'
import { DAOSource } from '../../src/logic/peer-cluster'
import { main } from '../../src/service'
import { AppComponents } from '../../src/types'
import { deleteFolderRecursive } from './E2ETestUtils'

process.env.RUNNING_TESTS = 'true'

// The native-fetch content client (dcl-catalyst-client@22) parses responses in Node's host realm,
// while Jest builds expected values in its sandbox realm. Node's `assert.deepStrictEqual` compares
// prototypes by reference and rejects otherwise-identical cross-realm objects (reported as "no
// visual difference"), so re-hydrate client results into the test realm before they reach assertions.
// NB: `structuredClone` looks tidier but isn't usable here — Jest 27's node sandbox doesn't expose it
// (`ReferenceError`), and copying the host's `structuredClone` in via fetch-environment.js would still
// mint host-realm objects, i.e. the very cross-realm mismatch we're fixing. A JSON round-trip runs in
// this realm; entity payloads are plain JSON (no Date/undefined) so nothing is lost.
function toTestRealm<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/** A wrapper around a server that helps make tests more easily */
export class TestProgram {
  public readonly namePrefix: string
  public shouldDeleteStorageAtStop = true

  public program?: Lifecycle.ComponentBasedProgram<AppComponents>
  /** The mocked DAO source installed on this server's content cluster — set by test helpers, read by `createAdditionalServer` to share the same DAO across instances. */
  public dao?: DAOSource
  private readonly client: ContentClient
  logger: ILoggerComponent.ILogger

  constructor(public components: AppComponents) {
    // dcl-catalyst-client@22 is native-fetch based: it posts deployments as a native `FormData` and
    // reads response bodies via `arrayBuffer()` (no node-fetch `.buffer()` / `form-data` stream), so
    // the test client uses the same native `@dcl/fetch-component` fetcher the production server does.
    this.client = createContentClient({
      url: this.getUrl(),
      fetcher: createFetchComponent()
    })
    this.logger = components.logs.getLogger('TestProgram')
  }

  async startProgram() {
    const initComponents = async () => {
      return this.components
    }

    if (this.program) {
      throw new Error('TestProgram is already running')
    }

    this.program = await Lifecycle.run<AppComponents>({
      main,
      initComponents
    })
  }

  getUrl(): string {
    const port = this.components.env.getConfig(EnvironmentConfig.HTTP_SERVER_PORT)
    return `http://127.0.0.1:${port}`
  }

  async stopProgram(): Promise<void> {
    if (this.program) {
      await this.program.stop()
      this.program = undefined
    }

    if (this.shouldDeleteStorageAtStop) {
      deleteFolderRecursive(this.components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER))
    }
  }

  async deployEntity(deployData: DeploymentData, fix: boolean = false) {
    this.logger.info('Deploying entity ' + deployData.entityId)

    // A background sync can momentarily hold a pointer lock, in which case the server rejects the
    // deploy as retryable ("... currently being deployed. Please try again in a few seconds."). Only
    // that specific case is retried so the test isn't flaky against the synchronizer; every other
    // failure still surfaces immediately.
    const maxAttempts = 8
    let returnValue: any
    for (let attempt = 1; ; attempt++) {
      const response = (await this.client.deploy(deployData)) as any
      returnValue = await response.json()

      if (response.ok) {
        break
      }

      const pointersLocked =
        Array.isArray(returnValue?.errors) &&
        returnValue.errors.some((error: string) => error.includes('currently being deployed'))
      if (!pointersLocked || attempt >= maxAttempts) {
        throw new Error(JSON.stringify(returnValue))
      }
      await sleep(500)
    }

    if (isInvalidDeployment(returnValue)) {
      throw new Error(returnValue.errors.join(','))
    }
    this.logger.info('Deployed entity ' + deployData.entityId, { creationTimestamp: returnValue.creationTimestamp })

    // Refresh materialized view to make the deployment immediately available for third-party collection queries
    await this.components.database.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY active_third_party_collection_items_deployments_with_content'
    )

    return returnValue.creationTimestamp as number
  }

  getFailedDeployments(): Promise<FailedDeployment[]> {
    return this.makeRequest(`${this.getUrl()}/failed-deployments`)
  }

  getEntitiesByPointers(pointers: string[]): Promise<Entity[]> {
    return this.client.fetchEntitiesByPointers(pointers).then(toTestRealm)
  }

  getEntitiesByIds(...ids: string[]): Promise<Entity[]> {
    return this.client.fetchEntitiesByIds(ids).then(toTestRealm)
  }

  getEntityById(id: string): Promise<Entity> {
    return this.client.fetchEntityById(id).then(toTestRealm)
  }

  async downloadContent(fileHash: string): Promise<Buffer> {
    // v22's client returns a Uint8Array; wrap it back into a Buffer so existing assertions that
    // compare against Buffer-valued deployment files (toEqual/deepStrictEqual) keep matching.
    return Buffer.from(await this.client.downloadContent(fileHash))
  }

  async getAuditInfo(entity: Entity): Promise<AuditInfo> {
    const legacyAuditInfo = (await fetch(`${this.getUrl()}/audit/${entity.type}/${entity.id}`)).json()
    return { ...legacyAuditInfo, localTimestamp: 0 }
  }

  async getDeployments(options?: DeploymentOptions): Promise<Deployment[]> {
    const filters = Object.assign({ from: 1 }, options?.filters)
    const deployments = await getDeployments(this.components, this.components.database, { ...options, filters })
    return deployments.deployments
  }

  private async makeRequest(url: string): Promise<any> {
    const response = await fetch(url)
    if (!response.ok) {
      // Drain the body so the native fetcher releases the socket before the assertion aborts.
      await response.text().catch(() => undefined)
    }
    expect(response.ok).toBe(true)
    return response.json()
  }
}

export async function startProgramAndWaitUntilBootstrapFinishes(server: TestProgram) {
  // Intercept syncOrchestrator.synchronize so the test can await the bootstrap-finished
  // future before assertions run.
  const orchestrator = server.components.syncOrchestrator
  const synchronizeOriginal = orchestrator.synchronize.bind(orchestrator)
  jest.spyOn(orchestrator, 'synchronize').mockImplementation(async () => {
    const [a, b] = await synchronizeOriginal()
    await b
    return [a, b]
  })
  await server.startProgram()
}
