import { delay, ServerBaseUrl } from '@catalyst/commons'
import log4js from 'log4js'
import ms from 'ms'
import { AppComponents } from '../../types'
import { FailedDeployment } from '../errors/FailedDeploymentsManager'
import { DeploymentContext } from '../Service'
import { bootstrapFromSnapshots } from './bootstrapFromSnapshots'
import { ContentCluster } from './ContentCluster'
import { deployEntityFromRemoteServer } from './deployRemoteEntity'

export interface SynchronizationManager {
  start(): Promise<void>
  stop(): Promise<void>
  getStatus(): void
}

type ContentSyncComponents = Pick<
  AppComponents,
  | 'staticConfigs'
  | 'logs'
  | 'downloadQueue'
  | 'metrics'
  | 'fetcher'
  | 'synchronizationJobManager'
  | 'deployer'
  | 'batchDeployer'
>

export enum SynchronizationState {
  BOOTSTRAPPING = 'Bootstrapping',
  SYNCED = 'Synced',
  SYNCING = 'Syncing'
}

export class ClusterSynchronizationManager implements SynchronizationManager {
  private static readonly LOGGER = log4js.getLogger('ClusterSynchronizationManager')

  private synchronizationState: SynchronizationState = SynchronizationState.BOOTSTRAPPING

  constructor(
    public components: ContentSyncComponents,
    private readonly cluster: ContentCluster,
    private readonly disableSynchronization: boolean // TODO: [new-sync] put this in components
  ) {}

  async start(): Promise<void> {
    if (this.disableSynchronization) {
      ClusterSynchronizationManager.LOGGER.warn(`Cluster synchronization has been disabled.`)
      return
    }

    // Connect to the cluster and obtain all Content Clients
    await this.cluster.connect()

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

  // TODO: [new-sync] Add info about other catalysts conectivity
  getStatus() {
    const clusterStatus = this.cluster.getStatus()
    return {
      ...clusterStatus,
      synchronizationState: this.synchronizationState
    }
  }

  // This is the method that is called to sync with other catalysts
  async syncWithServers(): Promise<void> {
    bootstrap: {
      // Note: If any deployment was overwritten by the snapshots, then we never reach them
      ClusterSynchronizationManager.LOGGER.info(`Starting to bootstrap from snapshots`)
      this.components.metrics.observe('dcl_sync_state_summary', { state: 'bootstrapping' }, 1)
      await bootstrapFromSnapshots(this.components, this.cluster)
      this.components.metrics.observe('dcl_sync_state_summary', { state: 'bootstrapping' }, 0)
      this.synchronizationState = SynchronizationState.SYNCED
    }

    sync: {
      ClusterSynchronizationManager.LOGGER.info(`Starting to sync with servers`)
      this.components.metrics.observe('dcl_sync_state_summary', { state: 'syncing' }, 1)
      const setDesiredJobs = () => {
        this.synchronizationState = SynchronizationState.SYNCING
        const desiredJobNames = new Set(this.cluster.getAllServersInCluster())
        // the job names are the contentServerUrl
        return this.components.synchronizationJobManager.setDesiredJobs(desiredJobNames)
      }

      // start the sync jobs
      setDesiredJobs()

      // setDesiredJobs every time we synchronize the DAO servers, this is an asynchronous job.
      // the setDesiredJobs function handles the lifecycle od those async jobs.
      this.cluster.onSyncFinished(() => {
        this.synchronizationState = SynchronizationState.SYNCED
        setDesiredJobs()
      })
    }
  }

  private async retryFailedDeploymentExecution(): Promise<void> {
    // Get Failed Deployments from local storage
    const failedDeployments: FailedDeployment[] = await this.components.deployer.getAllFailedDeployments()
    ClusterSynchronizationManager.LOGGER.info(`Found ${failedDeployments.length} failed deployments.`)

    const contentServersUrls: ServerBaseUrl[] = this.cluster.getAllServersInCluster()

    // TODO: Implement an exponential backoff for retrying
    for (const failedDeployment of failedDeployments) {
      // Build Deployment from other servers
      const { entityId, entityType, authChain } = failedDeployment
      if (authChain) {
        ClusterSynchronizationManager.LOGGER.info(`Will retry to deploy entity with id: '${entityId}'`)
        try {
          await deployEntityFromRemoteServer(
            this.components,
            entityId,
            entityType,
            authChain,
            contentServersUrls,
            DeploymentContext.FIX_ATTEMPT
          )
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
      // TODO: [new-sync] Make this configurable
      await delay(ms('15m'))
      await this.retryFailedDeploymentExecution()
    }
  }

  private async waitUntilSyncFinishes(): Promise<void> {
    await this.components.downloadQueue.onIdle()
    await this.components.batchDeployer.onIdle()

    while (this.components.synchronizationJobManager.getRunningJobs().size) {
      await delay(ms('1s'))
    }
  }
}
