import { Entity, EntityType } from '@dcl/schemas'
import {
  BuildEntityOptions,
  BuildEntityWithoutFilesOptions,
  ContentAPI,
  ContentClient,
  DeploymentData,
  DeploymentPreparationData
} from 'dcl-catalyst-client'
import { CompleteRequestOptions, Fetcher, RequestOptions, ServerStatus } from 'dcl-catalyst-commons'
import future, { IFuture } from 'fp-future'
import log4js from 'log4js'
/**
 * This content client  tries to use the internal docker network to connect lambdas with the content server.
 * If it can't, then it will try to contact it externally
 */
export class SmartContentClient implements ContentAPI {
  private static INTERNAL_CONTENT_SERVER_URL: string = `http://content-server:6969`
  private static LOGGER = log4js.getLogger('SmartContentClient')

  private contentClient: IFuture<ContentAPI> | undefined

  constructor(private readonly externalContentServerUrl: string) {}

  async fetchEntitiesByPointers(pointers: string[], options?: RequestOptions): Promise<Entity[]> {
    const client = await this.getClient()
    return client.fetchEntitiesByPointers(pointers, options)
  }

  async fetchEntitiesByIds(ids: string[], options?: RequestOptions): Promise<Entity[]> {
    const client = await this.getClient()
    return client.fetchEntitiesByIds(ids, options)
  }

  async fetchEntityById(id: string, options?: RequestOptions): Promise<Entity> {
    const client = await this.getClient()
    return client.fetchEntityById(id, options)
  }

  async fetchAuditInfo(type: EntityType, id: string, options?: RequestOptions) {
    const contentUrl = (await this.getClient()).getContentUrl()
    const fetcher = new Fetcher()

    return (await fetcher.fetch(`${contentUrl}/audit/${type}/${id}`, options)).json()
  }

  async fetchContentStatus(options?: RequestOptions): Promise<ServerStatus> {
    const contentUrl = (await this.getClient()).getContentUrl()
    const fetcher = new Fetcher()

    return (await fetcher.fetch(`${contentUrl}/status`, options)).json()
  }

  async downloadContent(contentHash: string, options?: RequestOptions): Promise<Buffer> {
    const client = await this.getClient()
    return client.downloadContent(contentHash, options)
  }

  private KNOWN_HEADERS: string[] = [
    'Content-Type',
    'Access-Control-Allow-Origin',
    'Access-Control-Expose-Headers',
    'ETag',
    'Date',
    'Content-Length',
    'Cache-Control'
  ]

  private findFixedHeader(headerName: string): string | undefined {
    return this.KNOWN_HEADERS.find((item) => item.toLowerCase() === headerName.toLowerCase())
  }

  private onlyKnownHeaders(headersFromResponse: Headers): Map<string, string> {
    const headers: Map<string, string> = new Map()
    headersFromResponse?.forEach((headerValue, headerName) => {
      const fixedHeaderFound = this.findFixedHeader(headerName)
      if (fixedHeaderFound) {
        headers.set(fixedHeaderFound, headerValue)
      }
    })
    return headers
  }

  async pipeContent(
    contentHash: string,
    responseTo: any,
    options?: Partial<CompleteRequestOptions>
  ): Promise<Map<string, string>> {
    const contentUrl = (await this.getClient()).getContentUrl()
    const fetcher = new Fetcher()
    return this.onlyKnownHeaders(await fetcher.fetchPipe(`${contentUrl}/contents/${contentHash}`, responseTo, options))
  }

  deployEntity(deployData: DeploymentData, fix?: boolean, options?: RequestOptions): Promise<number> {
    throw new Error('New deployments are currently not supported')
  }

  deploy(deployData: DeploymentData, options?: RequestOptions): Promise<unknown> {
    throw new Error('New deployments are currently not supported')
  }

  buildEntity({ type, pointers, files, metadata }: BuildEntityOptions): Promise<DeploymentPreparationData> {
    throw new Error('New deployments are currently not supported')
  }
  buildEntityWithoutNewFiles({
    type,
    pointers,
    hashesByKey,
    metadata
  }: BuildEntityWithoutFilesOptions): Promise<DeploymentPreparationData> {
    throw new Error('New deployments are currently not supported')
  }

  getContentUrl(): string {
    throw new Error('Get content url is currently not supported')
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
        SmartContentClient.LOGGER.info('Defaulting to external content server url: ', contentClientUrl)
      }
      this.contentClient.resolve(
        new ContentClient({
          contentUrl: contentClientUrl
        })
      )
    }
    return this.contentClient
  }
}
