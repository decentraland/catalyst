import { createCatalystDeploymentStream } from '@dcl/snapshots-fetcher'
import { createJobLifecycleManagerComponent } from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { EntityType } from 'dcl-catalyst-commons'
import ms from 'ms'
import path from 'path'
import { Controller } from './controller/Controller'
import { Environment, EnvironmentConfig } from './Environment'
import { FetcherFactory } from './helpers/FetcherFactory'
import { metricsDeclaration } from './metrics'
import { MigrationManagerFactory } from './migrations/MigrationManagerFactory'
import { createDenylistComponent } from './ports/denylist'
import { createDeploymentListComponent } from './ports/deploymentListComponent'
import { createDeployRateLimiter } from './ports/deployRateLimiterComponent'
import { createFailedDeploymentsCache } from './ports/failedDeploymentsCache'
import { createFetchComponent } from './ports/fetcher'
import { createFsComponent } from './ports/fs'
import { createDatabaseComponent } from './ports/postgres'
import { createSequentialTaskExecutor } from './ports/sequecuentialTaskExecutor'
import { RepositoryFactory } from './repository/RepositoryFactory'
import { AuthenticatorFactory } from './service/auth/AuthenticatorFactory'
import { DeploymentManager } from './service/deployments/DeploymentManager'
import { GarbageCollectionManager } from './service/garbage-collection/GarbageCollectionManager'
import { PointerManager } from './service/pointers/PointerManager'
import { Server } from './service/Server'
import { MetaverseContentService } from './service/Service'
import { ServiceFactory } from './service/ServiceFactory'
import { SnapshotManager } from './service/snapshots/SnapshotManager'
import { createBatchDeployerComponent } from './service/synchronization/batchDeployer'
import { ChallengeSupervisor } from './service/synchronization/ChallengeSupervisor'
import { DAOClientFactory } from './service/synchronization/clients/DAOClientFactory'
import { ContentCluster } from './service/synchronization/ContentCluster'
import { createRetryFailedDeployments } from './service/synchronization/retryFailedDeployments'
import { createSynchronizationManager } from './service/synchronization/SynchronizationManager'
import { SystemPropertiesManager } from './service/system-properties/SystemProperties'
import { createServerValidator } from './service/validations/server'
import { createValidator } from './service/validations/validator'
import { ContentStorageFactory } from './storage/ContentStorageFactory'
import { AppComponents } from './types'

export async function initComponentsWithEnv(env: Environment): Promise<AppComponents> {
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const repository = await RepositoryFactory.create({ env, metrics })
  const logs = createLogComponent()
  const fetcher = createFetchComponent()
  const fs = createFsComponent()
  const denylist = await createDenylistComponent({ env, logs, fs })
  const contentStorageFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const tmpDownloadFolder = path.join(contentStorageFolder, '_tmp')
  await fs.mkdir(tmpDownloadFolder, { recursive: true })
  const staticConfigs = {
    contentStorageFolder,
    tmpDownloadFolder
  }

  const database = await createDatabaseComponent({ logs, env, metrics })

  const sequentialExecutor = createSequentialTaskExecutor({ metrics, logs })

  const systemPropertiesManager = new SystemPropertiesManager(repository)

  const challengeSupervisor = new ChallengeSupervisor()

  const catalystFetcher = FetcherFactory.create({ env })
  const daoClient = DAOClientFactory.create(env)
  const authenticator = AuthenticatorFactory.create(env)
  const storage = await ContentStorageFactory.local(env)

  const contentCluster = new ContentCluster(
    {
      daoClient,
      challengeSupervisor,
      fetcher,
      logs,
      env
    },
    env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL)
  )
  const deploymentManager = new DeploymentManager()

  // TODO: this should be in the src/logic folder. It is not a component
  const pointerManager = new PointerManager()

  const failedDeploymentsCache = createFailedDeploymentsCache()

  const deployRateLimiter = createDeployRateLimiter(
    { logs },
    {
      defaultTtl: env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL) ?? ms('1m'),
      defaultMax: env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX) ?? 300,
      entitiesConfigTtl:
        env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_TTL) ?? new Map(),
      entitiesConfigMax:
        env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_MAX) ?? new Map()
    }
  )

  const validator = createValidator({ storage, authenticator, catalystFetcher, env, logs })
  const serverValidator = createServerValidator({ failedDeploymentsCache, metrics })

  const deployedEntitiesFilter = createDeploymentListComponent({ database, logs })

  const deployer: MetaverseContentService = ServiceFactory.create({
    metrics,
    storage,
    deploymentManager,
    failedDeploymentsCache,
    deployRateLimiter,
    pointerManager,
    repository,
    validator,
    serverValidator,
    env,
    logs,
    authenticator,
    database,
    deployedEntitiesFilter,
    denylist
  })

  const snapshotManager = new SnapshotManager(
    { database, metrics, staticConfigs, logs, storage, denylist },
    env.getConfig(EnvironmentConfig.SNAPSHOT_FREQUENCY_IN_MILLISECONDS)
  )

  const garbageCollectionManager = new GarbageCollectionManager(
    { repository, deployer, systemPropertiesManager, metrics, logs, storage },
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION),
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL)
  )

  const downloadQueue = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 60000
  })

  const batchDeployer = createBatchDeployerComponent(
    {
      logs,
      downloadQueue,
      fetcher,
      database,
      metrics,
      deployer,
      staticConfigs,
      deployedEntitiesFilter,
      storage
    },
    {
      autoStart: true,
      concurrency: 10,
      timeout: 100000
    }
  )

  const synchronizationJobManager = createJobLifecycleManagerComponent(
    { logs },
    {
      jobManagerName: 'SynchronizationJobManager',
      createJob(contentServer) {
        return createCatalystDeploymentStream(
          { logs, downloadQueue, fetcher, metrics, deployer: batchDeployer, storage },
          {
            tmpDownloadFolder: staticConfigs.tmpDownloadFolder,
            contentServer,

            // time between every poll to /pointer-changes
            pointerChangesWaitTime: 5000,

            // reconnection time for the whole catalyst
            reconnectTime: 1000 /* one second */,
            reconnectRetryTimeExponent: 1.2,
            maxReconnectionTime: 3_600_000 /* one hour */,

            // download entities retry
            requestMaxRetries: 10,
            requestRetryWaitTime: 5000
          }
        )
      }
    }
  )

  const retryFailedDeployments = createRetryFailedDeployments({
    env,
    metrics,
    staticConfigs,
    fetcher,
    downloadQueue,
    logs,
    deployer,
    contentCluster,
    failedDeploymentsCache,
    storage
  })

  const synchronizationManager = createSynchronizationManager({
    synchronizationJobManager,
    logs,
    contentCluster,
    retryFailedDeployments
  })

  const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK)

  const controller = new Controller(
    {
      synchronizationManager,
      challengeSupervisor,
      snapshotManager,
      deployer,
      logs,
      metrics,
      database,
      sequentialExecutor,
      denylist
    },
    ethNetwork
  )

  const migrationManager = MigrationManagerFactory.create({ logs, env })

  const server = new Server({ controller, metrics, env, logs })

  return {
    env,
    database,
    deployer,
    metrics,
    fetcher,
    logs,
    staticConfigs,
    batchDeployer,
    downloadQueue,
    synchronizationJobManager,
    deployedEntitiesFilter,
    controller,
    repository,
    synchronizationManager,
    challengeSupervisor,
    snapshotManager,
    contentCluster,
    deploymentManager,
    failedDeploymentsCache,
    deployRateLimiter,
    pointerManager,
    storage,
    authenticator,
    migrationManager,
    validator,
    serverValidator,
    garbageCollectionManager,
    systemPropertiesManager,
    catalystFetcher,
    daoClient,
    server,
    retryFailedDeployments,
    sequentialExecutor,
    denylist,
    fs
  }
}
