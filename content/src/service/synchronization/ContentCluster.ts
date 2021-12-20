import { delay, ServerBaseUrl, ServerMetadata } from '@catalyst/commons'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { Timestamp } from 'dcl-catalyst-commons'
import future from 'fp-future'
import ms from 'ms'
import { AppComponents } from '../../types'
import { ChallengeText } from './ChallengeSupervisor'
import { ConnectionState, ContentServerClient } from './clients/ContentServerClient'

export interface IdentityProvider {
  getIdentityInDAO(): ServerIdentity | undefined
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

  // My own identity
  private myIdentity: ServerIdentity | undefined
  // Servers that were reached at least once
  private serverClients: Map<ServerBaseUrl, ContentServerClient> = new Map()
  // All the servers on the DAO. Renewed with each sync
  private allServersInDAO: Set<ServerMetadata>
  // Time of last sync with the DAO
  private timeOfLastSync: Timestamp = 0

  private syncFinishedEventCallbacks: Array<() => void> = []

  // this future is a signal to stop the synchronization
  private stoppedFuture = future<void>()

  constructor(
    private readonly components: Pick<AppComponents, 'logs' | 'daoClient' | 'challengeSupervisor' | 'fetcher'>,
    private readonly timeBetweenSyncs: number
  ) {
    ContentCluster.LOGGER = components.logs.getLogger('ContentCluster')
  }

  /** Connect to the DAO for the first time */
  async start(): Promise<void> {
    // Get all servers on the DAO
    this.allServersInDAO = await this.components.daoClient.getAllContentServers()

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
    const otherServers = Array.from(this.serverClients.entries()).map(([baseUrl, client]) => ({
      baseUrl,
      connectionState: ConnectionState.NEVER_REACHED, // TODO: [new-sync]
      lastDeploymentTimestamp: 0 // TODO: [new-sync]
    }))

    return { otherServers, lastSyncWithDAO: this.timeOfLastSync }
  }

  getAllServersInCluster(): ContentServerClient[] {
    return Array.from(this.serverClients.values())
  }

  getIdentityInDAO(): ServerIdentity | undefined {
    return this.myIdentity
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
      ContentCluster.LOGGER.debug(`Starting sync with DAO`)

      // Refresh the server list
      this.allServersInDAO = await this.components.daoClient.getAllContentServers()

      if (!this.myIdentity) {
        await this.detectMyIdentity(1)
      }

      // Get all addresses in cluster (except for me)
      const allServerBaseUrls: ServerBaseUrl[] = this.getAllOtherAddressesOnDAO(this.allServersInDAO)

      // Handle the possibility that some servers where removed from the DAO. If so, remove them from the list
      this.handleRemovalsFromDAO(allServerBaseUrls)

      // Detect new servers
      const newServerBaseUrls = allServerBaseUrls.filter((baseUrl) => !this.serverClients.has(baseUrl))
      if (newServerBaseUrls.length > 0) {
        for (const serverBaseUrl of newServerBaseUrls) {
          // Create and store the new client
          const newClient = new ContentServerClient(serverBaseUrl)
          this.serverClients.set(serverBaseUrl, newClient)
          ContentCluster.LOGGER.info(`Discovered new server '${serverBaseUrl}'`)
        }
      }

      // Update sync time
      this.timeOfLastSync = Date.now()

      for (const cb of this.syncFinishedEventCallbacks) {
        cb()
      }

      ContentCluster.LOGGER.debug(`Finished sync with DAO`)
    } catch (error) {
      ContentCluster.LOGGER.error(`Failed to sync with the DAO \n${error}`)
    }
  }

  private handleRemovalsFromDAO(allServersBaseUrls: string[]): void {
    // Calculate if any known servers where removed from the DAO
    const serversRemovedFromDAO = Array.from(this.serverClients.keys()).filter(
      (serverBaseUrl) => !allServersBaseUrls.includes(serverBaseUrl)
    )

    // Remove servers from list
    serversRemovedFromDAO.forEach((serverBaseUrl) => {
      this.serverClients.delete(serverBaseUrl)
    })
  }

  /** Detect my own identity */
  async detectMyIdentity(attempts: number): Promise<void> {
    try {
      ContentCluster.LOGGER.info('Attempting to determine my identity')

      // Fetch server list from the DAO
      if (!this.allServersInDAO) {
        ContentCluster.LOGGER.info(`Fetching DAO servers`)
        this.allServersInDAO = await this.components.daoClient.getAllContentServers()
      }

      const challengesByAddress: Map<ServerBaseUrl, ChallengeText> = new Map()

      const daoServerWithoutAnswers = new Set<string>(Array.from(this.allServersInDAO).map(($) => $.baseUrl))

      while (attempts > 0 && challengesByAddress.size < this.allServersInDAO.size) {
        // Prepare challenges for unknown servers
        const challengeResults = await Promise.allSettled(
          Array.from(this.allServersInDAO)
            .filter((server) => !challengesByAddress.has(server.baseUrl))
            .map(async (server) => ({
              server,
              challengeText: await this.getChallengeInServer(server.baseUrl)
            }))
        )

        ContentCluster.LOGGER.info(
          `Attempt ${attempts} - Pending answers from [${Array.from(daoServerWithoutAnswers).join(',')}]`
        )

        const serversWithMyChallengeText: ServerMetadata[] = []

        // Store new challenge results
        for (const r of challengeResults) {
          if (r.status == 'fulfilled' && r.value.challengeText) {
            challengesByAddress.set(r.value.server.baseUrl, r.value.challengeText)
            daoServerWithoutAnswers.delete(r.value.server.baseUrl)
            // Check if I was any of the servers who responded
            if (this.components.challengeSupervisor.isChallengeOk(r.value.challengeText)) {
              serversWithMyChallengeText.push(r.value.server)
            }
          }
        }

        if (serversWithMyChallengeText.length === 1) {
          this.myIdentity = serversWithMyChallengeText[0]
          ContentCluster.LOGGER.info(`Calculated my identity. My baseUrl is ${this.myIdentity.baseUrl}`)
          break
        } else if (serversWithMyChallengeText.length > 1) {
          ContentCluster.LOGGER.warn(
            `Expected to find only one server with my challenge text '${this.components.challengeSupervisor.getChallengeText()}', but found ${
              serversWithMyChallengeText.length
            }`
          )
          break
        } else if (daoServerWithoutAnswers.size == 0) {
          ContentCluster.LOGGER.warn(`This server doesn't belong to the DAO`)
          break
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
      .filter((baseUrl) => baseUrl !== this.myIdentity?.baseUrl)

    // We are sorting the array, so when we query the servers, we will choose a different one each time
    return shuffleArray(serverUrls)
  }

  /** Return the server's challenge text, or undefined if it couldn't be reached */
  private async getChallengeInServer(catalystBaseUrl: ServerBaseUrl): Promise<ChallengeText | undefined> {
    const response = await this.components.fetcher.fetch(`${catalystBaseUrl}/challenge`)
    if (!response.ok) return
    const json: { challengeText: ChallengeText } = await response.json()
    return json.challengeText
  }
}

type ServerIdentity = ServerMetadata
