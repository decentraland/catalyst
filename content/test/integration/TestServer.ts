import fetch from 'node-fetch'
import {
  ServerAddress,
  Timestamp,
  EntityType,
  Pointer,
  ServerStatus,
  EntityId,
  Entity as ControllerEntity,
  LegacyPartialDeploymentHistory,
  Deployment as ControllerDeployment,
  ContentFileHash,
  LegacyAuditInfo,
  DeploymentBase
} from 'dcl-catalyst-commons'
import {
  ContentClient,
  DeploymentFields,
  DeploymentOptions,
  DeploymentWithMetadataContentAndPointers
} from 'dcl-catalyst-client'
import { Server } from '@katalyst/content/Server'
import { Environment, EnvironmentConfig, Bean } from '@katalyst/content/Environment'
import { ControllerDenylistData } from '@katalyst/content/controller/Controller'
import { DeployData, hashAndSignMessage, Identity, deleteFolderRecursive } from './E2ETestUtils'
import { buildEntityTarget, DenylistTarget, buildContentTarget } from '@katalyst/content/denylist/DenylistTarget'
import { FailedDeployment } from '@katalyst/content/service/errors/FailedDeploymentsManager'
import { assertResponseIsOkOrThrow } from './E2EAssertions'

/** A wrapper around a server that helps make tests more easily */
export class TestServer extends Server {
  public readonly namePrefix: string
  private readonly serverPort: number
  private readonly storageFolder: string
  private started: boolean = false

  private readonly client: ContentClient

  constructor(env: Environment) {
    super(env)
    this.serverPort = env.getConfig(EnvironmentConfig.SERVER_PORT)
    this.storageFolder = env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER)
    this.client = new ContentClient(this.getAddress(), '', env.getBean(Bean.FETCHER))
  }

  getAddress(): ServerAddress {
    return `http://localhost:${this.serverPort}`
  }

  start(): Promise<void> {
    this.started = true
    return super.start()
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

  async deploy(deployData: DeployData, fix: boolean = false): Promise<Timestamp> {
    return this.client.deployEntity(deployData, fix)
  }

  getFailedDeployments(): Promise<FailedDeployment[]> {
    return this.makeRequest(`${this.getAddress()}/failedDeployments`)
  }

  getEntitiesByPointers(type: EntityType, pointers: Pointer[]): Promise<ControllerEntity[]> {
    return this.client.fetchEntitiesByPointers(type, pointers)
  }

  getHistory(): Promise<LegacyPartialDeploymentHistory> {
    return this.client.fetchHistory()
  }

  getDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    options?: DeploymentOptions<T>
  ): Promise<ControllerDeployment[]> {
    return this.client.fetchAllDeployments(
      Object.assign({ fields: DeploymentFields.POINTERS_CONTENT_METADATA_AND_AUDIT_INFO }, options)
    )
  }

  getStatus(): Promise<ServerStatus> {
    return this.client.fetchStatus()
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

  denylistEntity(entity: ControllerEntity, identity: Identity): Promise<void> {
    const entityTarget = buildEntityTarget(EntityType[entity.type.toUpperCase().trim()], entity.id)
    return this.denylistTarget(entityTarget, identity)
  }

  undenylistEntity(entity: ControllerEntity, identity: Identity): Promise<void> {
    const entityTarget = buildEntityTarget(EntityType[entity.type.toUpperCase().trim()], entity.id)
    return this.undenylistTarget(entityTarget, identity)
  }

  async denylistContent(fileHash: ContentFileHash, identity: Identity): Promise<void> {
    const contentTarget = buildContentTarget(fileHash)
    return this.denylistTarget(contentTarget, identity)
  }

  private async denylistTarget(target: DenylistTarget, identity: Identity) {
    const timestamp = Date.now()
    const [address, signature] = hashAndSignMessage(`${target.asString()}${timestamp}`, identity)

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

  private async undenylistTarget(target: DenylistTarget, identity: Identity) {
    const timestamp = Date.now()
    const [address, signature] = hashAndSignMessage(`${target.asString()}${timestamp}`, identity)
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
