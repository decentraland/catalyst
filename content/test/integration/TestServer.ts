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
  ServerAddress,
  ServerStatus,
  Timestamp
} from 'dcl-catalyst-commons'
import fetch from 'node-fetch'
import { AppComponents } from 'src/types'
import { ControllerDenylistData } from '../../src/controller/Controller'
import { buildContentTarget, buildEntityTarget, DenylistTarget } from '../../src/denylist/DenylistTarget'
import { Bean, Environment, EnvironmentConfig } from '../../src/Environment'
import { Server } from '../../src/Server'
import { FailedDeployment } from '../../src/service/errors/FailedDeploymentsManager'
import { assertResponseIsOkOrThrow } from './E2EAssertions'
import { deleteFolderRecursive, hashAndSignMessage, Identity } from './E2ETestUtils'

/** A wrapper around a server that helps make tests more easily */
export class TestServer extends Server {
  public readonly namePrefix: string
  private readonly serverPort: number
  private readonly storageFolder: string
  private started: boolean = false

  private readonly client: ContentClient

  constructor(env: Environment, components: Partial<AppComponents>) {
    super(env, components)
    this.serverPort = env.getConfig(EnvironmentConfig.SERVER_PORT)
    this.storageFolder = env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER)
    this.client = new ContentClient({
      contentUrl: this.getAddress(),
      proofOfWorkEnabled: false,
      fetcher: env.getBean(Bean.FETCHER)
    })
  }

  override shouldInitializeMetricsServer(): boolean {
    return false
  }

  getAddress(): ServerAddress {
    return `http://localhost:${this.serverPort}`
  }

  async start(): Promise<void> {
    await super.start()
    this.started = true
  }

  async stop(
    options: { deleteStorage: boolean; endDbConnection: boolean } = { deleteStorage: true, endDbConnection: true }
  ): Promise<void> {
    if (this.started) {
      this.started = false
      await super.stop({ endDbConnection: options.endDbConnection })
    }
    if (options.deleteStorage) {
      deleteFolderRecursive(this.storageFolder)
    }
  }

  async deploy(deployData: DeploymentData, fix: boolean = false): Promise<Timestamp> {
    return this.client.deployEntity(deployData, fix)
  }

  getFailedDeployments(): Promise<FailedDeployment[]> {
    return this.makeRequest(`${this.getAddress()}/failed-deployments`)
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
    return this.makeRequest(`${this.getAddress()}/denylist`)
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

    const deployResponse = await fetch(`${this.getAddress()}/denylist/${target.getType()}/${target.getId()}`, {
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
    const deployResponse = await fetch(`${this.getAddress()}/denylist/${target.getType()}/${target.getId()}?${query}`, {
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
