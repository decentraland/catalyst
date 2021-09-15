import { delay, SynchronizationState } from '@catalyst/commons'
import { DeploymentWithAuditInfo, ServerAddress, Timestamp } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import ms from 'ms'
import { Transform } from 'stream'
import { clearTimeout, setTimeout } from 'timers'
import { streamMap } from '../../service/synchronization/streaming/StreamHelper'
import { SystemPropertiesManager, SystemProperty } from '../system-properties/SystemProperties'
import { ContentServerClient } from './clients/ContentServerClient'
import { ContentCluster } from './ContentCluster'
import { EventDeployer } from './EventDeployer'
import { DeploymentWithSource } from './streaming/EventStreamProcessor'

export interface SynchronizationManager {
  start(): Promise<void>
  stop(): Promise<void>
  getStatus(): void
}

export class ClusterSynchronizationManager implements SynchronizationManager {
  private static readonly LOGGER = log4js.getLogger('ClusterSynchronizationManager')
  private lastKnownDeployments: Map<ServerAddress, Timestamp>
  private syncWithNodesTimeout: NodeJS.Timeout
  private synchronizationState: SynchronizationState = SynchronizationState.BOOTSTRAPPING
  private stopping: boolean = false
  private timeOfLastSync: Timestamp = 0
  private timeoutStreamId: NodeJS.Timeout

  constructor(
    private readonly cluster: ContentCluster,
    private readonly systemProperties: SystemPropertiesManager,
    private readonly deployer: EventDeployer,
    private readonly timeBetweenSyncs: number,
    private readonly disableSynchronization: boolean,
    private readonly syncStreamTimeout: string
  ) {}

  timeoutStreams(streams: Transform[]): void {
    console.log(`this.syncStreamTimeout: ${this.syncStreamTimeout}`)
    this.timeoutStreamId = setTimeout(() => {
      // Update flag
      ClusterSynchronizationManager.LOGGER.warn(`Sync stream has timeouted`)
      const isBootstrapping = this.synchronizationState === SynchronizationState.BOOTSTRAPPING

      if (isBootstrapping) {
        ClusterSynchronizationManager.LOGGER.info(`It was bootstrapping, ignoring timeout`)
        clearTimeout(this.timeoutStreamId)
        return
      }

      ClusterSynchronizationManager.LOGGER.warn(`Ending all open streams`)
      streams.forEach((stream) => {
        try {
          stream.end()
        } catch (error) {
          ClusterSynchronizationManager.LOGGER.warn(`Error ending stream ${JSON.stringify(error, null, 3)}`)
        }
      })
    }, ms(this.syncStreamTimeout))
  }

  async start(): Promise<void> {
    if (this.disableSynchronization) {
      ClusterSynchronizationManager.LOGGER.warn(`Cluster synchronization has been disabled.`)
      return
    }
    // Make sure the stopping flag is set to false
    this.stopping = false

    // Connect to the cluster
    await this.cluster.connect()

    // Read last deployments
    this.lastKnownDeployments = new Map(
      await this.systemProperties.getSystemProperty(SystemProperty.LAST_KNOWN_LOCAL_DEPLOYMENTS)
    )

    // Sync with other servers
    await this.syncWithServers()
  }

  stop(): Promise<void> {
    if (this.disableSynchronization) {
      // Since it was disabled, there is nothing to stop
      return Promise.resolve()
    }
    this.stopping = true
    if (this.syncWithNodesTimeout) clearTimeout(this.syncWithNodesTimeout)
    this.cluster.disconnect()
    return this.waitUntilSyncFinishes()
  }

  getStatus() {
    const clusterStatus = this.cluster.getStatus()
    return {
      ...clusterStatus,
      synchronizationState: this.synchronizationState,
      lastSyncWithOtherServers: this.timeOfLastSync
    }
  }

  private async syncWithServers(): Promise<void> {
    // Update flag
    if (this.synchronizationState !== SynchronizationState.BOOTSTRAPPING) {
      this.synchronizationState = SynchronizationState.SYNCING
    }

    ClusterSynchronizationManager.LOGGER.debug(`Starting to sync with servers`)
    try {
      // Gather all servers
      const contentServers: ContentServerClient[] = this.cluster.getAllServersInCluster()

      // Fetch all new deployments
      const streams = contentServers.map((contentServer) => {
        const deploymentStream = contentServer.getNewDeployments()
        const sourceData = streamMap<DeploymentWithAuditInfo, DeploymentWithSource>((deployment) => ({
          deployment,
          source: contentServer
        }))
        return deploymentStream.pipe(sourceData)
      })

      this.timeoutStreams(streams)

      // Process them together
      await this.deployer.processAllDeployments(streams)

      // If everything worked, then update the last deployment timestamp
      contentServers.forEach((client) => {
        // Update the client, so it knows from when to ask next time
        const newTimestamp = client.allDeploymentsWereSuccessful()

        // Update the map, so we can store in on the database
        this.lastKnownDeployments.set(client.getAddress(), newTimestamp)
      })

      // Update the database
      await this.systemProperties.setSystemProperty(
        SystemProperty.LAST_KNOWN_LOCAL_DEPLOYMENTS,
        Array.from(this.lastKnownDeployments.entries())
      )

      this.synchronizationState = SynchronizationState.SYNCED
      this.timeOfLastSync = Date.now()
      ClusterSynchronizationManager.LOGGER.debug(`Finished syncing with servers`)
    } catch (error) {
      this.synchronizationState = SynchronizationState.FAILED_TO_SYNC
      ClusterSynchronizationManager.LOGGER.error(`Failed to sync with servers. Reason:\n${error}`)
    } finally {
      clearTimeout(this.timeoutStreamId)
      if (!this.stopping) {
        // Set the timeout again
        this.syncWithNodesTimeout = setTimeout(() => this.syncWithServers(), this.timeBetweenSyncs)
      }
    }
  }

  private waitUntilSyncFinishes(): Promise<void> {
    return new Promise(async (resolve) => {
      while (this.synchronizationState === SynchronizationState.SYNCING) {
        await delay(ms('1s'))
      }
      resolve()
    })
  }
}
