import { delay, SynchronizationState } from '@catalyst/commons'
import { Timestamp } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import ms from 'ms'
import { SynchronizerDeployerComponents } from '../../types'
import { FailedDeployment } from '../errors/FailedDeploymentsManager'
import { bootstrapFromSnapshots } from './bootstrapFromSnapshots'
import { ContentCluster } from './ContentCluster'
import { deployEntityFromRemoteServer } from './deployRemoteEntity'

export interface SynchronizationManager {
  start(): Promise<void>
  stop(): Promise<void>
  getStatus(): void
}

export class ClusterSynchronizationManager implements SynchronizationManager {
  private static readonly LOGGER = log4js.getLogger('ClusterSynchronizationManager')
  private synchronizationState: SynchronizationState = SynchronizationState.BOOTSTRAPPING
  private timeOfLastSync: Timestamp = 0

  constructor(
    public components: SynchronizerDeployerComponents,
    private readonly cluster: ContentCluster,
    private readonly disableSynchronization: boolean,
    private readonly checkSyncRange: number,
    readonly contentStorageFolder: string
  ) {}

  async start(): Promise<void> {
    if (this.disableSynchronization) {
      ClusterSynchronizationManager.LOGGER.warn(`Cluster synchronization has been disabled.`)
      return
    }

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

  async stop(): Promise<void> {
    if (this.disableSynchronization) {
      // Since it was disabled, there is nothing to stop
      return Promise.resolve()
    }
    this.components.synchronizationJobManager.setDesiredJobs(new Set())
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
    bootstrap: {
      this.synchronizationState = SynchronizationState.BOOTSTRAPPING
      // Note: If any deployment was overwritten by the snapshots, then we never reach them
      ClusterSynchronizationManager.LOGGER.info(`Starting to bootstrap from snapshots`)
      this.components.metrics.observe('dcl_sync_state_summary', { state: 'bootstrapping' }, 1)
      await bootstrapFromSnapshots(this.components, this.cluster)
      this.components.metrics.observe('dcl_sync_state_summary', { state: 'bootstrapping' }, 0)
      // await this.updateLastTimestamp(contentServers, result)
    }

    sync: {
      // Update flag: it was synced and needs to get new deployments
      this.synchronizationState = SynchronizationState.SYNCING
      this.components.metrics.observe('dcl_sync_state_summary', { state: 'syncing' }, 1)

      ClusterSynchronizationManager.LOGGER.info(`Starting to sync with servers`)

      const setDesiredJobs = () => {
        const desiredJobNames = new Set(this.cluster.getAllServersInCluster().map(($) => $.getServerUrl()))
        // the job names are the contentServerUrl
        return this.components.synchronizationJobManager.setDesiredJobs(desiredJobNames)
      }

      // start the sync jobs
      setDesiredJobs()

      // setDesiredJobs every time we synchronize the DAO servers, this is an asynchronous job.
      // the setDesiredJobs function handles the lifecycle od those async jobs.
      this.cluster.onSyncFinished(() => {
        setDesiredJobs()
      })
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
    const failedDeployments: FailedDeployment[] = await this.components.deployer.getAllFailedDeployments()

    ClusterSynchronizationManager.LOGGER.info(`Found ${failedDeployments.length} failed deployments.`)

    const servers = this.cluster.getAllServersInCluster().map(($) => $.getServerUrl())

    // TODO: Implement an exponential backoff for retrying
    for (const failedDeployment of failedDeployments) {
      // Build Deployment from other servers
      const { entityId, entityType, authChain } = failedDeployment
      if (authChain) {
        ClusterSynchronizationManager.LOGGER.info(`Will retry to deploy entity with id: '${entityId}'`)
        try {
          await deployEntityFromRemoteServer(this.components, entityId, entityType, authChain, servers)
        } catch {}
      } else {
        ClusterSynchronizationManager.LOGGER.info(
          `Can't retry failed deployment: '${entityId}' because it lacks of authChain`
        )
      }
    }
  }

  private async retryFailedDeployments(): Promise<void> {
    while (true) {
      await delay(ms('1h'))
      const isSynced: boolean = this.synchronizationState != SynchronizationState.BOOTSTRAPPING
      if (isSynced) {
        await this.retryFailedDeploymentExecution()
      }
    }
  }

  private async waitUntilSyncFinishes(): Promise<void> {
    await this.components.downloadQueue.onIdle()
    await this.components.batchDeployer.onIdle()

    while (
      this.synchronizationState === SynchronizationState.SYNCING ||
      this.components.synchronizationJobManager.getRunningJobs().size
    ) {
      await delay(ms('1s'))
    }
  }
}
