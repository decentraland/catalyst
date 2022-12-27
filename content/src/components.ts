import { createTheGraphClient } from '@dcl/content-validator'
import { EntityType } from '@dcl/schemas'
import { createCatalystDeploymentStream } from '@dcl/snapshots-fetcher'
import { createJobLifecycleManagerComponent } from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import ms from 'ms'
import path from 'path'
import { Controller } from './controller/Controller'
import { Environment, EnvironmentConfig } from './Environment'
import { FetcherFactory } from './helpers/FetcherFactory'
import { splitByCommaTrimAndRemoveEmptyElements } from './logic/config-helpers'
import { metricsDeclaration } from './metrics'
import { MigrationManagerFactory } from './migrations/MigrationManagerFactory'
import { createActiveEntitiesComponent } from './ports/activeEntities'
import { createFileSystemContentStorage } from './ports/contentStorage/fileSystemContentStorage'
import { createDenylist } from './ports/denylist'
import { createDeployedEntitiesBloomFilter } from './ports/deployedEntitiesBloomFilter'
import { createDeployRateLimiter } from './ports/deployRateLimiterComponent'
import { createFailedDeploymentsCache } from './ports/failedDeploymentsCache'
import { createFetchComponent } from './ports/fetcher'
import { createFsComponent } from './ports/fs'
import { createDatabaseComponent } from './ports/postgres'
import { createSequentialTaskExecutor } from './ports/sequecuentialTaskExecutor'
import { createSystemProperties } from './ports/system-properties'
import { ContentAuthenticator } from './service/auth/Authenticator'
import { GarbageCollectionManager } from './service/garbage-collection/GarbageCollectionManager'
import { PointerManager } from './service/pointers/PointerManager'
import { Server } from './service/Server'
import { MetaverseContentService } from './service/Service'
import { ServiceImpl } from './service/ServiceImpl'
import { SnapshotManager } from './service/snapshots/SnapshotManager'
import { createBatchDeployerComponent } from './service/synchronization/batchDeployer'
import { ChallengeSupervisor } from './service/synchronization/ChallengeSupervisor'
import { DAOClientFactory } from './service/synchronization/clients/DAOClientFactory'
import { ContentCluster } from './service/synchronization/ContentCluster'
import { createRetryFailedDeployments } from './service/synchronization/retryFailedDeployments'
import { createSynchronizationManager } from './service/synchronization/SynchronizationManager'
import { createServerValidator } from './service/validations/server'
import { createExternalCalls, createSubGraphsComponent, createValidator } from './service/validations/validator'
import { AppComponents } from './types'
import { ethers } from 'ethers'

export async function initComponentsWithEnv(env: Environment): Promise<AppComponents> {
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const config = createConfigComponent({
    LOG_LEVEL: env.getConfig(EnvironmentConfig.LOG_LEVEL),
    IGNORE_BLOCKCHAIN_ACCESS_CHECKS: env.getConfig(EnvironmentConfig.IGNORE_BLOCKCHAIN_ACCESS_CHECKS)
  })
  const logs = await createLogComponent({
    config
  })
  const fetcher = createFetchComponent()
  const fs = createFsComponent()
  const denylist = await createDenylist({ env, logs, fs, fetcher })
  const contentStorageFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const tmpDownloadFolder = path.join(contentStorageFolder, '_tmp')
  await fs.mkdir(tmpDownloadFolder, { recursive: true })
  const staticConfigs = {
    contentStorageFolder,
    tmpDownloadFolder
  }

  const database = await createDatabaseComponent({ logs, env, metrics })

  const sequentialExecutor = createSequentialTaskExecutor({ metrics, logs })

  const systemProperties = createSystemProperties({ database })

  const challengeSupervisor = new ChallengeSupervisor()

  const catalystFetcher = FetcherFactory.create({ env })
  const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const storage = await createFileSystemContentStorage({ fs }, contentFolder)

  const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const ethereumProvider = new ethers.providers.JsonRpcProvider(
    `https://rpc.decentraland.org/${encodeURIComponent(ethNetwork)}?project=catalyst-content`
  )
  const maticProvider = new ethers.providers.JsonRpcProvider(
    ethNetwork === 'mainnet'
      ? `https://rpc.decentraland.org/polygon?project=catalyst-content`
      : `https://rpc.decentraland.org/mumbai?project=catalyst-content`
  )
  const daoClient = await DAOClientFactory.create(env, ethereumProvider)
  const authenticator = new ContentAuthenticator(
    ethereumProvider,
    env.getConfig(EnvironmentConfig.DECENTRALAND_ADDRESS)
  )

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

  // TODO: this should be in the src/logic folder. It is not a component
  const pointerManager = new PointerManager()

  const failedDeploymentsCache = createFailedDeploymentsCache({ metrics })

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

  const subGraphs = await createSubGraphsComponent({ env, metrics, logs, fetcher, ethereumProvider, maticProvider })
  const externalCalls = await createExternalCalls({
    storage,
    authenticator,
    catalystFetcher,
    env,
    logs
  })
  const theGraphClient = createTheGraphClient({ subGraphs, logs })
  const validator = createValidator({ config, externalCalls, logs, theGraphClient, subGraphs })
  const serverValidator = createServerValidator({ failedDeploymentsCache, metrics })

  const deployedEntitiesBloomFilter = createDeployedEntitiesBloomFilter({ database, logs })
  const activeEntities = createActiveEntitiesComponent({ database, env, logs, metrics, denylist, sequentialExecutor })

  const deployer: MetaverseContentService = new ServiceImpl({
    metrics,
    storage,
    failedDeploymentsCache,
    deployRateLimiter,
    pointerManager,
    validator,
    serverValidator,
    env,
    logs,
    authenticator,
    database,
    deployedEntitiesBloomFilter,
    activeEntities,
    denylist
  })

  const snapshotManager = new SnapshotManager(
    { database, metrics, staticConfigs, logs, storage, denylist, fs },
    env.getConfig(EnvironmentConfig.SNAPSHOT_FREQUENCY_IN_MILLISECONDS)
  )

  const garbageCollectionManager = new GarbageCollectionManager(
    { deployer, systemProperties, metrics, logs, storage, database },
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION),
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL)
  )

  const downloadQueue = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 60000
  })

  const ignoredTypes = splitByCommaTrimAndRemoveEmptyElements(
    env.getConfig<string>(EnvironmentConfig.SYNC_IGNORED_ENTITY_TYPES)
  )

  const batchDeployer = createBatchDeployerComponent(
    {
      logs,
      downloadQueue,
      fetcher,
      database,
      metrics,
      deployer,
      staticConfigs,
      deployedEntitiesBloomFilter: deployedEntitiesBloomFilter,
      storage
    },
    {
      ignoredTypes: new Set(ignoredTypes),
      queueOptions: {
        autoStart: true,
        concurrency: 10,
        timeout: 100000
      }
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
    retryFailedDeployments,
    metrics
  })

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
      activeEntities,
      denylist,
      fs
    },
    ethNetwork
  )

  const migrationManager = MigrationManagerFactory.create({ logs, env })

  env.logConfigValues(logs.getLogger('Environment'))

  const server = new Server({ controller, metrics, env, logs, fs })

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
    deployedEntitiesBloomFilter: deployedEntitiesBloomFilter,
    controller,
    synchronizationManager,
    challengeSupervisor,
    snapshotManager,
    contentCluster,
    failedDeploymentsCache,
    deployRateLimiter,
    pointerManager,
    storage,
    authenticator,
    migrationManager,
    externalCalls,
    validator,
    serverValidator,
    garbageCollectionManager,
    systemProperties,
    catalystFetcher,
    daoClient,
    server,
    retryFailedDeployments,
    activeEntities,
    sequentialExecutor,
    denylist,
    ethereumProvider,
    maticProvider,
    fs
  }
}
