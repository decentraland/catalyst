import { ServerBaseUrl } from '@dcl/catalyst-node-commons'
import { ILoggerComponent, Lifecycle } from '@well-known-components/interfaces'
import { ContentClient, DeploymentData } from 'dcl-catalyst-client'
import {
  AuditInfo,
  ContentFileHash,
  Deployment,
  Entity as ControllerEntity,
  EntityType,
  ServerStatus
} from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { EnvironmentConfig } from '../../src/Environment'
import { FailedDeployment } from '../../src/ports/failedDeploymentsCache'
import { main } from '../../src/service'
import { DeploymentOptions } from '../../src/service/deployments/types'
import { isInvalidDeployment } from '../../src/service/Service'
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
    this.client = new ContentClient({
      contentUrl: this.getUrl(),
      fetcher: components.catalystFetcher
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

  getUrl(): ServerBaseUrl {
    const port = this.components.env.getConfig(EnvironmentConfig.SERVER_PORT)
    return `http://localhost:${port}`
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

  async deploy(deployData: DeploymentData, fix: boolean = false): Promise<number> {
    this.logger.info('Deploying entity ' + deployData.entityId)
    const returnValue = await this.client.deployEntity(deployData, fix)
    if (isInvalidDeployment(returnValue)) {
      throw new Error(returnValue.errors.join(','))
    }
    this.logger.info('Deployed entity ' + deployData.entityId, { returnValue })
    return returnValue
  }

  getFailedDeployments(): Promise<FailedDeployment[]> {
    return this.makeRequest(`${this.getUrl()}/failed-deployments`)
  }

  getEntitiesByPointers(type: EntityType, pointers: string[]): Promise<ControllerEntity[]> {
    return this.client.fetchEntitiesByPointers(type, pointers)
  }

  getStatus(): Promise<ServerStatus> {
    return this.client.fetchContentStatus()
  }

  getEntitiesByIds(type: EntityType, ...ids: string[]): Promise<ControllerEntity[]> {
    return this.client.fetchEntitiesByIds(type, ids)
  }

  getEntityById(type: EntityType, id: string): Promise<ControllerEntity> {
    return this.client.fetchEntityById(type, id)
  }

  downloadContent(fileHash: ContentFileHash): Promise<Buffer> {
    return this.client.downloadContent(fileHash)
  }

  async getAuditInfo(entity: ControllerEntity): Promise<AuditInfo> {
    const legacyAuditInfo = await this.client.fetchAuditInfo(entity.type, entity.id)
    return { ...legacyAuditInfo, localTimestamp: 0 }
  }

  async getDeployments(options?: DeploymentOptions): Promise<Deployment[]> {
    const filters = Object.assign({ from: 1 }, options?.filters)
    const deployments = await this.components.deployer.getDeployments({ ...options, filters })
    return deployments.deployments
  }

  private async makeRequest(url: string): Promise<any> {
    const response = await fetch(url)
    expect(response.ok).toBe(true)
    return response.json()
  }
}
