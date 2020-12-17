import {
  ContentAPI,
  ContentClient,
  DeploymentData,
  DeploymentOptions,
  DeploymentWithMetadataContentAndPointers
} from 'dcl-catalyst-client'
import {
  AvailableContentResult,
  ContentFileHash,
  DeploymentBase,
  Entity,
  EntityId,
  EntityType,
  Fetcher,
  LegacyAuditInfo,
  LegacyDeploymentHistory,
  LegacyPartialDeploymentHistory,
  Pointer,
  RequestOptions,
  ServerName,
  ServerStatus,
  Timestamp
} from 'dcl-catalyst-commons'
import future, { IFuture } from 'fp-future'
import log4js from 'log4js'
import { Readable } from 'stream'

/**
 * This content client  tries to use the internal docker network to connect lambdas with the content server.
 * If it can't, then it will try to contact it externally
 */

export class SmartContentClient implements ContentAPI {
  private static INTERNAL_CONTENT_SERVER_URL: string = `http://content-server:6969`
  private static LOGGER = log4js.getLogger('SmartContentClient')

  private contentClient: IFuture<ContentAPI> | undefined

  constructor(private readonly externalContentServerUrl: string) {}

  async fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]> {
    const client = await this.getClient()
    return client.fetchEntitiesByPointers(type, pointers, options)
  }

  async fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]> {
    const client = await this.getClient()
    return client.fetchEntitiesByIds(type, ids, options)
  }

  async fetchEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity> {
    const client = await this.getClient()
    return client.fetchEntityById(type, id, options)
  }

  async fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<LegacyAuditInfo> {
    const client = await this.getClient()
    return client.fetchAuditInfo(type, id, options)
  }

  async fetchFullHistory(
    query?: { from?: Timestamp; to?: Timestamp; serverName?: ServerName },
    options?: RequestOptions
  ): Promise<LegacyDeploymentHistory> {
    const client = await this.getClient()
    return client.fetchFullHistory(query, options)
  }

  async fetchHistory(
    query?: { from?: Timestamp; to?: Timestamp; serverName?: ServerName; offset?: number; limit?: number },
    options?: RequestOptions
  ): Promise<LegacyPartialDeploymentHistory> {
    const client = await this.getClient()
    return client.fetchHistory(query, options)
  }

  async fetchStatus(options?: RequestOptions): Promise<ServerStatus> {
    const client = await this.getClient()
    return client.fetchStatus(options)
  }

  async fetchAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions?: DeploymentOptions<T>,
    options?: RequestOptions
  ): Promise<T[]> {
    const client = await this.getClient()
    return client.fetchAllDeployments(deploymentOptions, options)
  }

  streamAllDeployments<T extends DeploymentBase = DeploymentWithMetadataContentAndPointers>(
    deploymentOptions?: DeploymentOptions<T>,
    options?: RequestOptions
  ): Readable {
    throw new Error('Deployments streaming is currently not supported')
  }

  async downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer> {
    const client = await this.getClient()
    return client.downloadContent(contentHash, options)
  }

  async isContentAvailable(cids: ContentFileHash[], options?: RequestOptions): Promise<AvailableContentResult> {
    const client = await this.getClient()
    return client.isContentAvailable(cids, options)
  }

  deployEntity(deployData: DeploymentData, fix?: boolean, options?: RequestOptions): Promise<Timestamp> {
    throw new Error('New deployments are currently not supported')
  }

  getExternalContentServerUrl(): string {
    return this.externalContentServerUrl
  }

  /**
   * This method will return the already existing client, or it will create one if it doesn't exist.
   * When creating the client, we will first try to contact the content server using the internal docker network. If that fails, we will use
   * the external content url
   */
  private async getClient(): Promise<ContentAPI> {
    if (!this.contentClient) {
      this.contentClient = future()
      let contentClientUrl = this.externalContentServerUrl
      try {
        const fetcher = new Fetcher()
        await fetcher.fetchJson(`${SmartContentClient.INTERNAL_CONTENT_SERVER_URL}/status`, {
          attempts: 6,
          waitTime: '10s'
        })
        SmartContentClient.LOGGER.info('Will use the internal content server url')
        contentClientUrl = SmartContentClient.INTERNAL_CONTENT_SERVER_URL
      } catch {
        SmartContentClient.LOGGER.info('Defaulting to external content server url')
      }
      this.contentClient.resolve(new ContentClient(contentClientUrl, 'lambdas'))
    }
    return this.contentClient
  }
}
