import { CatalystServerInfo } from '@dcl/catalyst-contracts'
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
  getIdentity(): Promise<CatalystServerInfo | undefined>
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export class ContentCluster implements IdentityProvider {
  private logger: ILoggerComponent.ILogger

  // Servers that were reached at least once
  private serverClients: Set<string> = new Set()
  // Time of last sync with the DAO
  private timeOfLastSync: number = 0

  private syncFinishedEventCallbacks: Array<(serverClients: Set<string>) => void> = []

  private identityFuture: Promise<CatalystServerInfo | undefined> | undefined

  // this future is a signal to stop the synchronization
  private stoppedFuture = future<void>()

  constructor(
    private readonly components: Pick<
      AppComponents,
      'logs' | 'daoClient' | 'challengeSupervisor' | 'fetcher' | 'env' | 'clock'
    >,
    private readonly timeBetweenSyncs: number
  ) {
    this.logger = components.logs.getLogger('ContentCluster')
  }

  /** Connect to the DAO for the first time */
  async start(): Promise<void> {
    // determine my identity
    await this.getIdentity()

    // Perform first sync with the DAO
    await this.getContentServersFromDao()

    // Start recurrent sync job
    this.syncWithDAOJob().catch(this.logger.error)
  }

  /**
   * Registers an event that is emitted every time the list of catalysts is refreshed.
   */
  onSyncFinished(cb: (serverClients: Set<string>) => void): void {
    this.syncFinishedEventCallbacks.push(cb)
  }

  /** Stop syncing with DAO */
  stop(): void {
    this.stoppedFuture.resolve()
  }

  getStatus(): { lastSyncWithDAO: number } {
    return { lastSyncWithDAO: this.timeOfLastSync }
  }

  getAllServersInCluster(): string[] {
    return Array.from(this.serverClients)
  }

  async getIdentity(): Promise<CatalystServerInfo | undefined> {
    if (!this.identityFuture) {
      this.identityFuture = determineCatalystIdentity(this.components)
    }
    return this.identityFuture
  }

  private async syncWithDAOJob() {
    this.logger.info(`Starting sync with DAO every ${this.timeBetweenSyncs}ms`)

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

      if (allServersInDAO.length == 0) {
        throw new Error('There are no servers.')
      }

      // Get all addresses in cluster (except this one)
      const allServerBaseUrls: string[] = this.getAllOtherAddressesOnDAO(allServersInDAO)

      // Remove servers
      for (const serverBaseUrl of this.serverClients) {
        if (!allServerBaseUrls.includes(serverBaseUrl)) {
          this.serverClients.delete(serverBaseUrl)
          this.logger.info(`Removing server '${serverBaseUrl}'`)
        }
      }

      // Detect new servers
      for (const serverBaseUrl of allServerBaseUrls) {
        if (!this.serverClients.has(serverBaseUrl)) {
          // Create and store the new client
          this.serverClients.add(serverBaseUrl)
          this.logger.info(`Discovered new server '${serverBaseUrl}'.`)
        }
      }

      // Update sync time
      this.timeOfLastSync = this.components.clock.now()

      for (const cb of this.syncFinishedEventCallbacks) {
        cb(this.serverClients)
      }
    } catch (error) {
      this.logger.error(`Failed to sync with the DAO \n${error}`)
    }
    return Array.from(this.serverClients)
  }

  /** Returns all the addresses on the DAO, except for the current server's */
  private getAllOtherAddressesOnDAO(allServers: Array<CatalystServerInfo>): string[] {
    const normalizedContentServerAddress = normalizeContentBaseUrl(
      this.components.env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
    )

    // Filter myself out
    const serverUrls = allServers
      .map(({ address }) => address)
      .filter((address) => normalizeContentBaseUrl(address) != normalizedContentServerAddress)

    // We are sorting the array, so when we query the servers, we will choose a different one each time
    return shuffleArray(serverUrls)
  }
}
