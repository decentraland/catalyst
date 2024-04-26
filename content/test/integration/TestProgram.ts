import { Entity } from '@dcl/schemas'
import { ILoggerComponent, Lifecycle } from '@well-known-components/interfaces'
import { ContentClient, createContentClient } from 'dcl-catalyst-client/dist/client/ContentClient'
import { DeploymentData } from 'dcl-catalyst-client/dist/client/utils/DeploymentBuilder'
import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../src/Environment'
import { AuditInfo, Deployment, DeploymentOptions, isInvalidDeployment } from '../../src/deployment-types'
import { getDeployments } from '../../src/logic/deployments'
import * as synchronization from '../../src/logic/synchronization'
import { FailedDeployment } from '../../src/ports/failedDeployments'
import { main } from '../../src/service'
import { AppComponents } from '../../src/types'
import { deleteFolderRecursive } from './E2ETestUtils'

process.env.RUNNING_TESTS = 'true'

/** A wrapper around a server that helps make tests more easily */
export class TestProgram {
  public readonly namePrefix: string
  public shouldDeleteStorageAtStop = true

  public program?: Lifecycle.ComponentBasedProgram<AppComponents>
  private readonly client: ContentClient
  logger: ILoggerComponent.ILogger

  constructor(public components: AppComponents) {
    this.client = createContentClient({
      url: this.getUrl(),
      fetcher: components.fetcher
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
    const returnValue = await ((await this.client.deploy(deployData)) as any).json()

    if (isInvalidDeployment(returnValue)) {
      throw new Error(returnValue.errors.join(','))
    }
    this.logger.info('Deployed entity ' + deployData.entityId, { creationTimestamp: returnValue.creationTimestamp })
    return returnValue.creationTimestamp as number
  }

  getFailedDeployments(): Promise<FailedDeployment[]> {
    return this.makeRequest(`${this.getUrl()}/failed-deployments`)
  }

  getEntitiesByPointers(pointers: string[]): Promise<Entity[]> {
    return this.client.fetchEntitiesByPointers(pointers)
  }

  getEntitiesByIds(...ids: string[]): Promise<Entity[]> {
    return this.client.fetchEntitiesByIds(ids)
  }

  getEntityById(id: string): Promise<Entity> {
    return this.client.fetchEntityById(id)
  }

  downloadContent(fileHash: string): Promise<Buffer> {
    return this.client.downloadContent(fileHash)
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
    expect(response.ok).toBe(true)
    return response.json()
  }
}

export async function startProgramAndWaitUntilBootstrapFinishes(server: TestProgram) {
  const startSyncOriginal = synchronization.startSynchronization
  jest.spyOn(synchronization, 'startSynchronization').mockImplementation(async (...args) => {
    const [a, b] = await startSyncOriginal(...args)
    await b
    return [a, b]
  })
  await server.startProgram()
}
