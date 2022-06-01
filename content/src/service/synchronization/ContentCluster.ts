import { ServerBaseUrl, ServerMetadata } from '@dcl/catalyst-node-commons'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { ILoggerComponent } from '@well-known-components/interfaces'
import future from 'fp-future'
import { EnvironmentConfig } from '../../Environment'
import { determineCatalystIdentity, normalizeContentBaseUrl } from '../../logic/cluster-helpers'
import { AppComponents } from '../../types'

export interface IdentityProvider {
  /**
   * Returns undefined when this servers configured CONTENT_SERVER_URL is unreachable or missconfigured
   */
  getIdentity(): Promise<ServerMetadata | undefined>
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export class ContentCluster implements IdentityProvider {
  private static LOGGER: ILoggerComponent.ILogger

  // Servers that were reached at least once
  private serverClients: Set<ServerBaseUrl> = new Set()
  // Time of last sync with the DAO
  private timeOfLastSync: number = 0

  private syncFinishedEventCallbacks: Array<() => void> = []

  private identityFuture: Promise<ServerMetadata | undefined> | undefined

  // this future is a signal to stop the synchronization
  private stoppedFuture = future<void>()

  constructor(
    private readonly components: Pick<AppComponents, 'logs' | 'daoClient' | 'challengeSupervisor' | 'fetcher' | 'env'>,
    private readonly timeBetweenSyncs: number
  ) {
    ContentCluster.LOGGER = components.logs.getLogger('ContentCluster')
  }

  /** Connect to the DAO for the first time */
  async start(): Promise<void> {
    // determine my identity
    await this.getIdentity()

    // Perform first sync with the DAO
    await this.getContentServersFromDao()

    // Start recurrent sync job
    this.syncWithDAOJob().catch(ContentCluster.LOGGER.error)
  }

  /**
   * Registers an event that is emitted every time the list of catalysts is refreshed.
   */
  onSyncFinished(cb: () => void): void {
    this.syncFinishedEventCallbacks.push(cb)
  }

  /** Stop syncing with DAO */
  stop(): void {
    this.stoppedFuture.resolve()
  }

  getStatus(): { lastSyncWithDAO: number } {
    return { lastSyncWithDAO: this.timeOfLastSync }
  }

  getAllServersInCluster(): ServerBaseUrl[] {
    return Array.from(this.serverClients)
  }

  getIdentity(): Promise<ServerMetadata | undefined> {
    if (!this.identityFuture) {
      this.identityFuture = determineCatalystIdentity(this.components)
    }
    return this.identityFuture
  }

  private async syncWithDAOJob() {
    ContentCluster.LOGGER.info(`Starting sync with DAO every ${this.timeBetweenSyncs}ms`)

    while (this.stoppedFuture.isPending) {
      await Promise.race([sleep(this.timeBetweenSyncs), this.stoppedFuture])
      if (!this.stoppedFuture.isPending) return
      await this.getContentServersFromDao()
    }
  }

  /** Update our data with the DAO's servers list. Returns all servers in DAO excluding this one */
  async getContentServersFromDao() {
    try {
      // Refresh the server list
      const allServersInDAO = await this.components.daoClient.getAllContentServers()

      // Get all addresses in cluster (except this one)
      const allServerBaseUrls: ServerBaseUrl[] = [
        'https://peer-wc1.decentraland.org/content',
        'https://peer-eu1.decentraland.org/content',
        'https://peer-ec1.decentraland.org/content'
      ]

      // Remove servers
      for (const serverBaseUrl of this.serverClients) {
        if (!allServerBaseUrls.includes(serverBaseUrl)) {
          this.serverClients.delete(serverBaseUrl)
          ContentCluster.LOGGER.info(`Removing server '${serverBaseUrl}'`)
        }
      }

      // Detect new servers
      for (const serverBaseUrl of allServerBaseUrls) {
        if (!this.serverClients.has(serverBaseUrl)) {
          // Create and store the new client
          this.serverClients.add(serverBaseUrl)
          ContentCluster.LOGGER.info(`Discovered new server '${serverBaseUrl}'`)
        }
      }

      // Update sync time
      this.timeOfLastSync = Date.now()

      for (const cb of this.syncFinishedEventCallbacks) {
        cb()
      }
    } catch (error) {
      ContentCluster.LOGGER.error(`Failed to sync with the DAO \n${error}`)
    }
    return Array.from(this.serverClients)
  }

  /** Returns all the addresses on the DAO, except for the current server's */
  private getAllOtherAddressesOnDAO(allServers: Set<ServerMetadata>): ServerBaseUrl[] {
    const normalizedContentServerAddress = normalizeContentBaseUrl(
      this.components.env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
    )

    // Filter myself out
    const serverUrls = Array.from(allServers)
      .map(({ baseUrl }) => baseUrl)
      .filter((baseUrl) => normalizeContentBaseUrl(baseUrl) != normalizedContentServerAddress)

    // We are sorting the array, so when we query the servers, we will choose a different one each time
    return shuffleArray(serverUrls)
  }
}
