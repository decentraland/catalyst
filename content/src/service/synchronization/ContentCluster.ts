import { delay, ServerBaseUrl, ServerMetadata } from '@catalyst/commons'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { Timestamp } from 'dcl-catalyst-commons'
import future, { IFuture } from 'fp-future'
import ms from 'ms'
import { EnvironmentConfig } from '../../Environment'
import { getChallengeInServer } from '../../logic/cluster-helpers'
import { AppComponents } from '../../types'

export interface IdentityProvider {
  getIdentity(): Promise<ServerMetadata | undefined>
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function normalizeBaseUrl(url: string): string {
  return url.toLowerCase().replace(/\/$/, '')
}

export class ContentCluster implements IdentityProvider {
  private static LOGGER: ILoggerComponent.ILogger

  // Servers that were reached at least once
  private serverClients: Set<ServerBaseUrl> = new Set()
  // Time of last sync with the DAO
  private timeOfLastSync: Timestamp = 0

  private syncFinishedEventCallbacks: Array<() => void> = []

  private identityFuture: IFuture<ServerMetadata | undefined> = future()

  // from CONTENT_SERVER_ADDRESS, normalized
  private normalizedContentServerAddress: string

  // this future is a signal to stop the synchronization
  private stoppedFuture = future<void>()

  constructor(
    private readonly components: Pick<AppComponents, 'logs' | 'daoClient' | 'challengeSupervisor' | 'fetcher' | 'env'>,
    private readonly timeBetweenSyncs: number
  ) {
    ContentCluster.LOGGER = components.logs.getLogger('ContentCluster')
    this.normalizedContentServerAddress = normalizeBaseUrl(
      this.components.env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
    )
  }

  /** Connect to the DAO for the first time */
  async start(): Promise<void> {
    // determine my identity
    await this.detectMyIdentity(3)

    // Perform first sync with the DAO
    await this.syncWithDAO()

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

  getStatus() {
    return { lastSyncWithDAO: this.timeOfLastSync }
  }

  getAllServersInCluster(): ServerBaseUrl[] {
    return Array.from(this.serverClients)
  }

  getIdentity(): Promise<ServerMetadata | undefined> {
    return this.identityFuture
  }

  private async syncWithDAOJob() {
    ContentCluster.LOGGER.info(`Starting sync with DAO every ${this.timeBetweenSyncs}ms`)

    while (this.stoppedFuture.isPending) {
      await Promise.race([sleep(this.timeBetweenSyncs), this.stoppedFuture])
      if (!this.stoppedFuture.isPending) return
      await this.syncWithDAO()
    }
  }

  /** Update our data with the DAO's servers list */
  private async syncWithDAO() {
    try {
      // Refresh the server list
      const allServersInDAO = await this.components.daoClient.getAllContentServers()

      // Get all addresses in cluster (except this one)
      const allServerBaseUrls: ServerBaseUrl[] = this.getAllOtherAddressesOnDAO(allServersInDAO)

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
  }

  /** Detect my own identity */
  async detectMyIdentity(attempts: number): Promise<void> {
    try {
      ContentCluster.LOGGER.info('Attempting to determine my identity')

      while (attempts > 0) {
        const response = await getChallengeInServer(this.components, this.normalizedContentServerAddress)

        if (response && this.components.challengeSupervisor.isChallengeOk(response)) {
          const daoServers = await this.components.daoClient.getAllContentServers()
          const normalizedBaseUrl = normalizeBaseUrl(this.normalizedContentServerAddress)

          for (const server of daoServers) {
            if (normalizeBaseUrl(server.baseUrl) == normalizedBaseUrl) {
              this.identityFuture.resolve(server)
              ContentCluster.LOGGER.info(`Calculated my identity. My baseUrl is ${server.baseUrl}`)
              return
            }
          }
        }

        attempts--
        if (attempts > 0) {
          await delay(ms('30s'))
        }
      }
    } catch (error) {
      ContentCluster.LOGGER.error(`Failed to detect my own identity \n${error}`)
    }
  }

  /** Returns all the addresses on the DAO, except for the current server's */
  private getAllOtherAddressesOnDAO(allServers: Set<ServerMetadata>): ServerBaseUrl[] {
    // Filter myself out
    const serverUrls = Array.from(allServers)
      .map(({ baseUrl }) => baseUrl)
      .filter((baseUrl) => normalizeBaseUrl(baseUrl) != this.normalizedContentServerAddress)

    // We are sorting the array, so when we query the servers, we will choose a different one each time
    return shuffleArray(serverUrls)
  }
}
