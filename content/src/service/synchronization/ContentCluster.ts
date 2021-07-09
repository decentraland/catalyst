import { FetcherFactory } from '@katalyst/content/helpers/FetcherFactory'
import { Fetcher, ServerAddress, Timestamp } from 'dcl-catalyst-commons'
import { DAOClient } from 'decentraland-katalyst-commons/DAOClient'
import { ServerMetadata } from 'decentraland-katalyst-commons/ServerMetadata'
import { delay } from 'decentraland-katalyst-utils/util'
import log4js from 'log4js'
import ms from 'ms'
import { clearTimeout, setTimeout } from 'timers'
import { SystemPropertiesManager, SystemProperty } from '../system-properties/SystemProperties'
import { ChallengeSupervisor, ChallengeText } from './ChallengeSupervisor'
import { ContentServerClient } from './clients/ContentServerClient'
import { shuffleArray } from './ClusterUtils'

export interface IdentityProvider {
  getIdentityInDAO(): ServerIdentity | undefined
}

export class ContentCluster implements IdentityProvider {
  private static readonly LOGGER = log4js.getLogger('ContentCluster')

  // My own identity
  private myIdentity: ServerIdentity | undefined
  // Timeout set to sync with DAO
  private syncTimeout: NodeJS.Timeout
  // Servers that were reached at least once
  private serverClients: Map<ServerAddress, ContentServerClient> = new Map()
  // All the servers on the DAO. Renewed with each sync
  private allServersInDAO: Set<ServerMetadata>
  // Time of last sync with the DAO
  private timeOfLastSync: Timestamp = 0

  constructor(
    private readonly dao: DAOClient,
    private readonly timeBetweenSyncs: number,
    private readonly challengeSupervisor: ChallengeSupervisor,
    private readonly fetcher: Fetcher,
    private readonly systemProperties: SystemPropertiesManager,
    private readonly bootstrapFromScratch: boolean
  ) {}

  /** Connect to the DAO for the first time */
  async connect(): Promise<void> {
    // Get all servers on the DAO
    this.allServersInDAO = await this.dao.getAllContentServers()

    // Detect my own identity
    await this.detectMyIdentity(10)

    // Perform first sync with the DAO
    await this.syncWithDAO()
  }

  /** Stop syncing with DAO */
  disconnect() {
    clearTimeout(this.syncTimeout)
  }

  getStatus() {
    const otherServers = Array.from(this.serverClients.entries()).map(([address, client]) => ({
      address,
      connectionState: client.getConnectionState(),
      lastDeploymentTimestamp: client.getLastLocalDeploymentTimestamp()
    }))

    return { otherServers, lastSyncWithDAO: this.timeOfLastSync }
  }

  getAllServersInCluster(): ContentServerClient[] {
    return Array.from(this.serverClients.values())
  }

  getIdentityInDAO(): ServerIdentity | undefined {
    return this.myIdentity
  }

  /** Update our data with the DAO's servers list */
  private async syncWithDAO() {
    try {
      ContentCluster.LOGGER.debug(`Starting sync with DAO`)

      // Refresh the server list
      this.allServersInDAO = await this.dao.getAllContentServers()

      if (!this.myIdentity) {
        await this.detectMyIdentity()
      }

      // Get all addresses in cluster (except for me)
      const allAddresses: ServerAddress[] = this.getAllOtherAddressesOnDAO(this.allServersInDAO)

      // Handle the possibility that some servers where removed from the DAO. If so, remove them from the list
      this.handleRemovalsFromDAO(allAddresses)

      // Detect new servers
      const newAddresses = allAddresses.filter((address) => !this.serverClients.has(address))
      if (newAddresses.length > 0) {
        let lastKnownTimestamps: Map<ServerAddress, Timestamp> = new Map()

        // Check if we want to start syncing from scratch or not
        if (!this.bootstrapFromScratch) {
          lastKnownTimestamps = new Map(
            await this.systemProperties.getSystemProperty(SystemProperty.LAST_KNOWN_LOCAL_DEPLOYMENTS)
          )
        }

        for (const newAddress of newAddresses) {
          const lastDeploymentTimestamp = lastKnownTimestamps.get(newAddress) ?? 0

          // Create and store the new client
          const newClient = new ContentServerClient(
            newAddress,
            lastDeploymentTimestamp,
            FetcherFactory.copy(this.fetcher) // We need a Fetcher per catalyst
          )
          this.serverClients.set(newAddress, newClient)
          ContentCluster.LOGGER.info(`Discovered new server '${newAddress}'`)
        }
      }

      // Update sync time
      this.timeOfLastSync = Date.now()
      ContentCluster.LOGGER.debug(`Finished sync with DAO`)
    } catch (error) {
      ContentCluster.LOGGER.error(`Failed to sync with the DAO \n${error}`)
    } finally {
      // Set a timeout to stay in sync with the DAO
      this.syncTimeout = setTimeout(() => this.syncWithDAO(), this.timeBetweenSyncs)
    }
  }

  private handleRemovalsFromDAO(allAddresses: string[]): void {
    // Calculate if any known servers where removed from the DAO
    const serversRemovedFromDAO = Array.from(this.serverClients.keys()).filter(
      (address) => !allAddresses.includes(address)
    )

    // Remove servers from list
    serversRemovedFromDAO.forEach((address) => {
      this.serverClients.delete(address)
    })
  }

  /** Detect my own identity */
  async detectMyIdentity(attempts: number = 1): Promise<void> {
    try {
      ContentCluster.LOGGER.debug('Attempting to determine my identity')

      // Fetch server list from the DAO
      if (!this.allServersInDAO) {
        this.allServersInDAO = await this.dao.getAllContentServers()
      }

      const serversByAddresses: Map<ServerAddress, ServerMetadata> = new Map(
        Array.from(this.allServersInDAO).map((metadata) => [metadata.address, metadata])
      )
      const challengesByAddress: Map<ServerAddress, ChallengeText> = new Map()

      while (attempts > 0 && challengesByAddress.size < this.allServersInDAO.size) {
        // Prepare challenges for unknown servers
        const challenges: Promise<{ address: ServerAddress; challengeText: ChallengeText | undefined }>[] = Array.from(
          serversByAddresses.keys()
        )
          .filter((address) => !challengesByAddress.has(address))
          .map(async (address) => ({ address, challengeText: await this.getChallengeInServer(address) }))

        // Store new challenge results
        const challengeResults = await Promise.all(challenges)
        challengeResults
          .filter(({ challengeText }) => !!challengeText)
          .forEach(({ address, challengeText }) => challengesByAddress.set(address, challengeText!))

        // Check if I was any of the servers who responded
        const serversWithMyChallengeText = Array.from(challengesByAddress.entries()).filter(([, challengeText]) =>
          this.challengeSupervisor.isChallengeOk(challengeText)
        )

        if (serversWithMyChallengeText.length === 1) {
          const [address] = serversWithMyChallengeText[0]
          this.myIdentity = serversByAddresses.get(address)!
          ContentCluster.LOGGER.info(`Calculated my identity. My address is ${address}`)
          break
        } else if (serversWithMyChallengeText.length > 1) {
          ContentCluster.LOGGER.warn(
            `Expected to find only one server with my challenge text '${this.challengeSupervisor.getChallengeText()}', but found ${
              serversWithMyChallengeText.length
            }`
          )
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
  private getAllOtherAddressesOnDAO(allServers: Set<ServerMetadata>): ServerAddress[] {
    // Filter myself out
    const addresses = Array.from(allServers)
      .map(({ address }) => address)
      .filter((address) => address !== this.myIdentity?.address)

    // We are sorting the array, so when we query the servers, we will choose a different one each time
    return shuffleArray(addresses)
  }

  /** Return the server's challenge text, or undefined if it couldn't be reached */
  private async getChallengeInServer(address: ServerAddress): Promise<ChallengeText | undefined> {
    try {
      const { challengeText }: { challengeText: ChallengeText } = await this.fetcher.fetchJson(`${address}/challenge`)
      return challengeText
    } catch (error) {}
  }
}

type ServerIdentity = ServerMetadata
