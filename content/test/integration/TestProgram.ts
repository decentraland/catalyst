import { ServerBaseUrl } from '@catalyst/commons'
import { ILoggerComponent, Lifecycle } from '@well-known-components/interfaces'
import {
  ContentClient,
  DeploymentData,
  DeploymentFields,
  DeploymentOptions,
  DeploymentWithMetadataContentAndPointers
} from 'dcl-catalyst-client'
import {
  ContentFileHash,
  Deployment as ControllerDeployment,
  DeploymentBase,
  Entity as ControllerEntity,
  EntityId,
  EntityType,
  LegacyAuditInfo,
  Pointer,
  ServerStatus,
  Timestamp
} from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { ControllerDenylistData } from '../../src/controller/Controller'
import { buildContentTarget, buildEntityTarget, DenylistTarget } from '../../src/denylist/DenylistTarget'
import { EnvironmentConfig } from '../../src/Environment'
import { main } from '../../src/service'
import { FailedDeployment } from '../../src/service/errors/FailedDeploymentsManager'
import { isInvalidDeployment } from '../../src/service/Service'
import { AppComponents } from '../../src/types'
import { assertResponseIsOkOrThrow } from './E2EAssertions'
import { deleteFolderRecursive, hashAndSignMessage, Identity } from './E2ETestUtils'

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
      proofOfWorkEnabled: false,
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

  async deploy(deployData: DeploymentData, fix: boolean = false): Promise<Timestamp> {
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

  getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<ControllerEntity[]> {
    return this.client.fetchEntitiesByPointers(type, pointers)
  }

  getDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    options?: DeploymentOptions<T>
  ): Promise<ControllerDeployment[]> {
    const filters = Object.assign({ from: 1 }, options?.filters)

    return this.client.fetchAllDeployments({
      fields: DeploymentFields.POINTERS_CONTENT_METADATA_AND_AUDIT_INFO,
      ...options,
      filters: {
        ...filters
      }
    })
  }

  getStatus(): Promise<ServerStatus> {
    return this.client.fetchContentStatus()
  }

  getEntitiesByIds(type: EntityType, ...ids: EntityId[]): Promise<ControllerEntity[]> {
    return this.client.fetchEntitiesByIds(type, ids)
  }

  getEntityById(type: EntityType, id: EntityId): Promise<ControllerEntity> {
    return this.client.fetchEntityById(type, id)
  }

  downloadContent(fileHash: ContentFileHash): Promise<Buffer> {
    return this.client.downloadContent(fileHash)
  }

  getAuditInfo(entity: ControllerEntity): Promise<LegacyAuditInfo> {
    return this.client.fetchAuditInfo(entity.type, entity.id)
  }

  getDenylistTargets(): Promise<ControllerDenylistData[]> {
    return this.makeRequest(`${this.getUrl()}/denylist`)
  }

  denylistEntity(
    entity: ControllerEntity,
    identity: Identity,
    signatureOverwrite: string | undefined = undefined
  ): Promise<void> {
    const entityTarget = buildEntityTarget(EntityType[entity.type.toUpperCase().trim()], entity.id)
    return this.denylistTarget(entityTarget, identity, signatureOverwrite)
  }

  undenylistEntity(
    entity: ControllerEntity,
    identity: Identity,
    signatureOverwrite: string | undefined = undefined
  ): Promise<void> {
    const entityTarget = buildEntityTarget(EntityType[entity.type.toUpperCase().trim()], entity.id)
    return this.undenylistTarget(entityTarget, identity, signatureOverwrite)
  }

  async denylistContent(fileHash: ContentFileHash, identity: Identity): Promise<void> {
    const contentTarget = buildContentTarget(fileHash)
    return this.denylistTarget(contentTarget, identity)
  }

  private async denylistTarget(
    target: DenylistTarget,
    identity: Identity,
    signatureOverwrite: string | undefined = undefined
  ) {
    const timestamp = Date.now()
    const [address, calculatedSignature] = hashAndSignMessage(`block-${target.asString()}-${timestamp}`, identity)
    const signature = signatureOverwrite ?? calculatedSignature

    const body = {
      timestamp: timestamp,
      blocker: address,
      signature: signature
    }

    const deployResponse = await fetch(`${this.getUrl()}/denylist/${target.getType()}/${target.getId()}`, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    })
    await assertResponseIsOkOrThrow(deployResponse)
  }

  private async undenylistTarget(
    target: DenylistTarget,
    identity: Identity,
    signatureOverwrite: string | undefined = undefined
  ) {
    const timestamp = Date.now()
    const [address, calculatedSignature] = hashAndSignMessage(`unblock-${target.asString()}-${timestamp}`, identity)
    const signature = signatureOverwrite ?? calculatedSignature

    const query = `blocker=${address}&timestamp=${timestamp}&signature=${signature}`
    const deployResponse = await fetch(`${this.getUrl()}/denylist/${target.getType()}/${target.getId()}?${query}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    })
    await assertResponseIsOkOrThrow(deployResponse)
  }

  private async makeRequest(url: string): Promise<any> {
    const response = await fetch(url)
    expect(response.ok).toBe(true, `The request to ${url} failed`)
    return response.json()
  }
}
