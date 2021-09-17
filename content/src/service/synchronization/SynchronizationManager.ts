import { delay, SynchronizationState } from '@catalyst/commons'
import { ServerAddress, Timestamp } from 'dcl-catalyst-commons'
import mergeIterators from 'fast-merge-async-iterators'
import log4js from 'log4js'
import ms from 'ms'
import { clearTimeout, setTimeout } from 'timers'
import { metricsComponent } from '../../metrics'
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

  constructor(
    private readonly cluster: ContentCluster,
    private readonly systemProperties: SystemPropertiesManager,
    private readonly deployer: EventDeployer,
    private readonly timeBetweenSyncs: number,
    private readonly disableSynchronization: boolean
  ) {}

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
    let hasPendingDeployments = false

    try {
      // Gather all servers
      const contentServers: ContentServerClient[] = this.cluster.getAllServersInCluster()

      // Fetch all new deployments
      const streams = contentServers.map(async function* (contentServer): AsyncIterable<DeploymentWithSource> {
        metricsComponent.increment('dcl_content_deployments_streams_open_total', {
          remote_catalyst: contentServer.getAddress()
        })
        // measure how much time the streams remain open
        const { end: endTimer } = metricsComponent.startTimer('dcl_content_deployments_streams_open_time_seconds', {
          remote_catalyst: contentServer.getAddress()
        })
        try {
          for await (const deployment of contentServer.getNewDeployments()) {
            yield {
              deployment,
              source: contentServer
            }
          }
        } catch (error) {
          ClusterSynchronizationManager.LOGGER.error(`Error processing stream: ` + error)
          ClusterSynchronizationManager.LOGGER.error(error)
          metricsComponent.increment('dcl_content_deployments_streams_error_total', {
            remote_catalyst: contentServer.getAddress()
          })
        } finally {
          endTimer()
          metricsComponent.increment('dcl_content_deployments_streams_closed_total', {
            remote_catalyst: contentServer.getAddress()
          })
        }
      })

      // Process them together
      hasPendingDeployments = await this.deployer.processAllDeployments(mergeIterators('iters-close-wait', ...streams))

      ClusterSynchronizationManager.LOGGER.debug(`Updating content server timestamps`)

      // If everything worked, then update the last deployment timestamp
      contentServers.forEach((client) => {
        const newTimestamp = client.getPotentialLocalDeploymentTimestamp()

        if (!newTimestamp) return

        ClusterSynchronizationManager.LOGGER.debug(
          `Updating content server timestamps: ` + client.getAddress() + ' is ' + newTimestamp
        )
        // Update the map, so we can store in on the database
        this.lastKnownDeployments.set(client.getAddress(), newTimestamp)
      })

      ClusterSynchronizationManager.LOGGER.debug(`Updating system properties`)

      // Update the database
      await this.systemProperties.setSystemProperty(
        SystemProperty.LAST_KNOWN_LOCAL_DEPLOYMENTS,
        Array.from(this.lastKnownDeployments.entries())
      )

      if (!hasPendingDeployments) {
        this.synchronizationState = SynchronizationState.SYNCED
        this.timeOfLastSync = Date.now()
      }

      ClusterSynchronizationManager.LOGGER.debug(`Finished syncing with servers`)
    } catch (error) {
      this.synchronizationState = SynchronizationState.FAILED_TO_SYNC
      ClusterSynchronizationManager.LOGGER.error(`Failed to sync with servers. Reason:\n${error}`)
    } finally {
      if (!this.stopping) {
        // Set the timeout again
        this.syncWithNodesTimeout = setTimeout(
          () => this.syncWithServers(),
          hasPendingDeployments ? 0 : this.timeBetweenSyncs
        )
      }
    }
  }

  private async waitUntilSyncFinishes(): Promise<void> {
    while (this.synchronizationState !== SynchronizationState.SYNCED) {
      await delay(ms('1s'))
    }
  }
}
