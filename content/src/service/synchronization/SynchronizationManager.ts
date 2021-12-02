import { delay, SynchronizationState } from '@catalyst/commons'
import { DeploymentData } from 'dcl-catalyst-client'
import { DeploymentWithAuditInfo, ServerAddress, Timestamp } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import ms from 'ms'
import { clearTimeout, setTimeout } from 'timers'
import { metricsComponent } from '../../metrics'
import { FailedDeployment } from '../errors/FailedDeploymentsManager'
import { ClusterDeploymentsService, DeploymentContext, DeploymentResult, MetaverseContentService } from '../Service'
import { SystemPropertiesManager, SystemProperty } from '../system-properties/SystemProperties'
import { ContentServerClient } from './clients/ContentServerClient'
import { ContentCluster } from './ContentCluster'
import { EventDeployer } from './EventDeployer'
import { downloadDeployment } from './failed-deployments/Requests'
import { DeploymentWithSource } from './streaming/EventStreamProcessor'
import { streamMap } from './streaming/StreamHelper'

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
    private readonly service: MetaverseContentService & ClusterDeploymentsService,
    private readonly timeBetweenSyncs: number,
    private readonly disableSynchronization: boolean,
    private readonly checkSyncRange: number
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

    // Configure fail if sync hangs
    this.failIfSyncHangs().catch(() =>
      ClusterSynchronizationManager.LOGGER.error('There was an error during the check of synchronization.')
    )

    // Sync with other servers
    await this.syncWithServers()

    // Configure retry for failed deployments
    this.retryFailedDeployments().catch(() =>
      ClusterSynchronizationManager.LOGGER.error('There was an error during the retry of failed deployments.')
    )
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

  private async failIfSyncHangs(): Promise<void> {
    await delay(ms('30m'))

    while (true) {
      await delay(ms('5m'))

      const failedToSync: boolean = this.synchronizationState == SynchronizationState.FAILED_TO_SYNC
      if (failedToSync) {
        ClusterSynchronizationManager.LOGGER.error(`Restarting server because it has failed to sync.`)
        process.exit(1)
      }

      const isSyncing: boolean = this.synchronizationState == SynchronizationState.SYNCING
      const lastSync: number = Date.now() - this.timeOfLastSync

      // If it is a lot of time in the syncing state and it has not stored new deployments, then we should restart the service
      if (isSyncing && lastSync > this.checkSyncRange) {
        ClusterSynchronizationManager.LOGGER.error(
          `Restarting server because the last sync was at least ${this.checkSyncRange} seconds ago, at: ${lastSync}`
        )
        process.exit(1)
      }
    }
  }

  private async retryFailedDeploymentExecution(): Promise<void> {
    // Get Failed Deployments from local storage
    const failedDeployments: FailedDeployment[] = await this.service.getAllFailedDeployments()

    ClusterSynchronizationManager.LOGGER.info(`Found ${failedDeployments.length} failed deployments.`)

    // TODO: Implement an exponential backoff for retrying
    failedDeployments.forEach(async (failedDeployment) => {
      // Build Deployment from other servers
      const entityId = failedDeployment.entityId
      ClusterSynchronizationManager.LOGGER.debug(`Will retry to deploy entity with id: '${entityId}'`)

      try {
        const data: DeploymentData = await downloadDeployment(this.cluster.getAllServersInCluster(), entityId)

        // Deploy local
        const result: DeploymentResult = await this.service.deployEntity(
          data.files,
          entityId,
          { authChain: data.authChain },
          DeploymentContext.FIX_ATTEMPT
        )
        if (typeof result === 'number') {
          ClusterSynchronizationManager.LOGGER.debug(`Deployment of entity with id '${entityId}' was successful`)
        } else {
          ClusterSynchronizationManager.LOGGER.debug(
            `Deployment of entity with id '${entityId}' failed due: ${result.errors.toString()}`
          )
        }
      } catch (err) {
        ClusterSynchronizationManager.LOGGER.debug(`Deployment of entity with id '${entityId}' failed due: ${err}`)
      }
    })
  }

  private async retryFailedDeployments(): Promise<void> {
    while (true) {
      await delay(ms('1h'))
      const isSynced: boolean = this.synchronizationState == SynchronizationState.SYNCED
      if (isSynced) {
        await this.retryFailedDeploymentExecution()
      }
    }
  }

  // This is the method that is called recursive to sync with other catalysts
  private async syncWithServers(): Promise<void> {
    // Update flag: if it's not bootstrapping, then that means that it was synced and needs to get new deployments
    if (this.synchronizationState !== SynchronizationState.BOOTSTRAPPING) {
      this.synchronizationState = SynchronizationState.SYNCING
      metricsComponent.observe('dcl_sync_state_summary', { state: 'syncing' }, 1)
    } else {
      metricsComponent.observe('dcl_sync_state_summary', { state: 'bootstrapping' }, 1)
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

      // Process them together
      await this.deployer.processAllDeployments(
        streams,
        undefined,
        this.synchronizationState === SynchronizationState.BOOTSTRAPPING
      )

      ClusterSynchronizationManager.LOGGER.debug(`Updating content server timestamps`)

      // If everything worked, then update the last deployment timestamp
      contentServers.forEach((client) => {
        // Update the client, so it knows from when to ask next time
        const newTimestamp = client.allDeploymentsWereSuccessful()

        ClusterSynchronizationManager.LOGGER.debug(
          `Updating content server timestamps: ` + client.getAddress() + ' is ' + newTimestamp
        )
        // Update the map, so we can store it on the database
        this.lastKnownDeployments.set(client.getAddress(), newTimestamp)
      })

      ClusterSynchronizationManager.LOGGER.debug(`Updating system properties`)

      // Update the database
      await this.systemProperties.setSystemProperty(
        SystemProperty.LAST_KNOWN_LOCAL_DEPLOYMENTS,
        Array.from(this.lastKnownDeployments.entries())
      )

      this.synchronizationState = SynchronizationState.SYNCED
      metricsComponent.observe('dcl_sync_state_summary', { state: 'synced' }, 1)
      this.timeOfLastSync = Date.now()
      ClusterSynchronizationManager.LOGGER.debug(`Finished syncing with servers`)

      await this.retryFailedDeploymentExecution()
    } catch (error) {
      this.synchronizationState = SynchronizationState.FAILED_TO_SYNC
      metricsComponent.observe('dcl_sync_state_summary', { state: 'failed_to_sync' }, 1)
      ClusterSynchronizationManager.LOGGER.error(`Failed to sync with servers. Reason:\n${error}`)
    } finally {
      if (!this.stopping) {
        // Set the timeout again
        this.syncWithNodesTimeout = setTimeout(() => this.syncWithServers(), this.timeBetweenSyncs)
      }
    }
  }

  private async waitUntilSyncFinishes(): Promise<void> {
    while (this.synchronizationState === SynchronizationState.SYNCING) {
      await delay(ms('1s'))
    }
  }
}
