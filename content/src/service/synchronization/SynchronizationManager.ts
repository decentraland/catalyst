import { delay, SynchronizationState } from '@catalyst/commons'
import { DeploymentData } from 'dcl-catalyst-client'
import { Timestamp } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import ms from 'ms'
import { clearTimeout, setTimeout } from 'timers'
import { metricsComponent } from '../../metrics'
import { FailedDeployment } from '../errors/FailedDeploymentsManager'
import { ClusterDeploymentsService, DeploymentContext, DeploymentResult, MetaverseContentService } from '../Service'
import { SystemPropertiesManager } from '../system-properties/SystemProperties'
import { ContentCluster } from './ContentCluster'
import { EventDeployer } from './EventDeployer'
import { downloadDeployment } from './failed-deployments/Requests'
import {
  bootstrapFromSnapshots,
  createSincronizationComponents,
  SynchronizerDeployerComponents
} from './new-synchronization'

export interface SynchronizationManager {
  start(): Promise<void>
  stop(): Promise<void>
  getStatus(): void
}

export class ClusterSynchronizationManager implements SynchronizationManager {
  private static readonly LOGGER = log4js.getLogger('ClusterSynchronizationManager')
  private syncWithNodesTimeout: NodeJS.Timeout
  private synchronizationState: SynchronizationState = SynchronizationState.BOOTSTRAPPING
  private stopping: boolean = false
  private timeOfLastSync: Timestamp = 0

  public components: SynchronizerDeployerComponents

  constructor(
    private readonly cluster: ContentCluster,
    readonly _systemProperties: SystemPropertiesManager,
    readonly deployer: EventDeployer,
    private readonly service: MetaverseContentService & ClusterDeploymentsService,
    private readonly timeBetweenSyncs: number,
    private readonly disableSynchronization: boolean,
    private readonly checkSyncRange: number,
    private readonly contentStorageFolder: string
  ) {
    this.components = createSincronizationComponents({
      contentStorageFolder,
      eventDeployer: deployer
    })
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

  // This is the method that is called recursive to sync with other catalysts
  async syncWithServers(): Promise<void> {
    this.synchronizationState = SynchronizationState.BOOTSTRAPPING
    // Note: If any deployment was overwritten by the snapshots, then we never reach them
    ClusterSynchronizationManager.LOGGER.info(`Starting to bootstrap from snapshots`)
    metricsComponent.observe('dcl_sync_state_summary', { state: 'bootstrapping' }, 1)

    await bootstrapFromSnapshots(this.components, this.cluster, this.contentStorageFolder)

    metricsComponent.observe('dcl_sync_state_summary', { state: 'bootstrapping' }, 0)
    // await this.updateLastTimestamp(contentServers, result)

    // Update flag: it was synced and needs to get new deployments
    this.synchronizationState = SynchronizationState.SYNCING
    metricsComponent.observe('dcl_sync_state_summary', { state: 'syncing' }, 1)
    ClusterSynchronizationManager.LOGGER.info(`Starting to sync with servers`)

    try {
      const setDesiredJobs = () => {
        const desiredJobNames = new Set(this.cluster.getAllServersInCluster().map(($) => $.getContentUrl()))
        // the job names are the contentServerUrl
        return this.components.synchronizationJobManager.setDesiredJobs(desiredJobNames)
      }

      // start the sync jobs
      setDesiredJobs()

      // setDesiredJobs every time we synchronize the DAO servers
      this.cluster.onSyncFinished(() => {
        setDesiredJobs()
      })
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

  private async failIfSyncHangs(): Promise<void> {
    await delay(ms('30m'))

    // If it is a lot of time in the syncing/failed state and it has not stored new deployments, then we should restart the service
    while (true) {
      await delay(ms('5m'))
      const lastSync: number = Date.now() - this.timeOfLastSync

      const failedToSync: boolean = this.synchronizationState == SynchronizationState.FAILED_TO_SYNC
      const isSyncing: boolean = this.synchronizationState == SynchronizationState.SYNCING

      if ((isSyncing || failedToSync) && lastSync > this.checkSyncRange) {
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
      ClusterSynchronizationManager.LOGGER.info(`Will retry to deploy entity with id: '${entityId}'`)

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
          ClusterSynchronizationManager.LOGGER.info(`Deployment of entity with id '${entityId}' was successful`)
        } else {
          ClusterSynchronizationManager.LOGGER.info(
            `Deployment of entity with id '${entityId}' failed due: ${result.errors.toString()}`
          )
        }
      } catch (err) {
        ClusterSynchronizationManager.LOGGER.info(`Deployment of entity with id '${entityId}' failed due: ${err}`)
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

  private async waitUntilSyncFinishes(): Promise<void> {
    while (this.synchronizationState === SynchronizationState.SYNCING) {
      await delay(ms('1s'))
    }
  }
}
