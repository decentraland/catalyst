import { createFolderBasedFileSystemContentStorage, createFsComponent } from '@dcl/catalyst-storage'
import { EntityType } from '@dcl/schemas'
import { createSynchronizer } from '@dcl/snapshots-fetcher'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { IFetchComponent } from '@well-known-components/http-server'
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
import { createClock } from './ports/clock'
import { createDenylist } from './ports/denylist'
import { createDeployedEntitiesBloomFilter } from './ports/deployedEntitiesBloomFilter'
import { createDeployRateLimiter } from './ports/deployRateLimiterComponent'
import { createFailedDeployments } from './ports/failedDeployments'
import { createFetchComponent } from './ports/fetcher'
import { createDatabaseComponent } from './ports/postgres'
import { createProcessedSnapshotStorage } from './ports/processedSnapshotStorage'
import { createSequentialTaskExecutor } from './ports/sequecuentialTaskExecutor'
import { createSnapshotGenerator } from './ports/snapshotGenerator'
import { createSnapshotStorage } from './ports/snapshotStorage'
import { createSynchronizationState } from './ports/synchronizationState'
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
import { createServerValidator } from './service/validations/server'
import {
  createExternalCalls,
  createIgnoreBlockchainValidator,
  createOnChainValidator
} from './service/validations/validator'
import { AppComponents } from './types'
import { HTTPProvider } from 'eth-connect'
import { ValidateFn } from '@dcl/content-validator'

function createProvider(fetcher: IFetchComponent, network: string): HTTPProvider {
  return new HTTPProvider(`https://rpc.decentraland.org/${encodeURIComponent(network)}?project=catalyst-content`, {
    fetch: fetcher.fetch
  })
}

export async function initComponentsWithEnv(env: Environment): Promise<AppComponents> {
  const clock = createClock()
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

  const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const l2Network = ethNetwork === 'mainnet' ? 'polygon' : 'mumbai'
  const l1Provider = createProvider(fetcher, ethNetwork)
  const l2Provider = createProvider(fetcher, l2Network)

  const database = await createDatabaseComponent({ logs, env, metrics })

  const sequentialExecutor = createSequentialTaskExecutor({ metrics, logs })

  const systemProperties = createSystemProperties({ database })

  const challengeSupervisor = new ChallengeSupervisor()

  const catalystFetcher = FetcherFactory.create({ env })
  const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const storage = await createFolderBasedFileSystemContentStorage({ fs }, contentFolder)

  const daoClient = await DAOClientFactory.create(env, l1Provider)
  const authenticator = new ContentAuthenticator(l1Provider, env.getConfig(EnvironmentConfig.DECENTRALAND_ADDRESS))

  const contentCluster = new ContentCluster(
    {
      daoClient,
      challengeSupervisor,
      fetcher,
      logs,
      env,
      clock
    },
    env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL)
  )

  // TODO: this should be in the src/logic folder. It is not a component
  const pointerManager = new PointerManager()

  const failedDeployments = await createFailedDeployments({ metrics, database })

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

  const externalCalls = await createExternalCalls({
    storage,
    authenticator,
    catalystFetcher,
    env,
    logs
  })

  async function createValidator() {
    const ignoreBlockChainAccess = (await config.getString('IGNORE_BLOCKCHAIN_ACCESS_CHECKS')) === 'true'

    let validate: ValidateFn
    if (ignoreBlockChainAccess) {
      validate = await createIgnoreBlockchainValidator({ logs, externalCalls })
    } else {
      validate = await createOnChainValidator({
        env,
        metrics,
        fetcher,
        l1Provider,
        l2Provider,
        config,
        externalCalls,
        logs
      })
    }

    return { validate }
  }

  const validator = await createValidator()
  const serverValidator = createServerValidator({ failedDeployments, metrics, clock })

  const deployedEntitiesBloomFilter = createDeployedEntitiesBloomFilter({ database, logs, clock })
  const activeEntities = createActiveEntitiesComponent({ database, env, logs, metrics, denylist, sequentialExecutor })

  const deployer: MetaverseContentService = new ServiceImpl({
    metrics,
    storage,
    failedDeployments,
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
    denylist,
    clock
  })

  const snapshotManager = new SnapshotManager({ database, metrics, staticConfigs, logs, storage, denylist, fs, clock })

  const garbageCollectionManager = new GarbageCollectionManager(
    { clock, database, metrics, logs, storage, systemProperties },
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

  const processedSnapshotStorage = createProcessedSnapshotStorage({ database, clock, logs })

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
      storage,
      failedDeployments,
      clock
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

  const snapshotStorage = createSnapshotStorage({ database })

  const synchronizer = await createSynchronizer(
    {
      logs,
      downloadQueue,
      fetcher,
      metrics,
      deployer: batchDeployer,
      storage,
      processedSnapshotStorage,
      snapshotStorage
    },
    {
      // reconnection options
      bootstrapReconnection: {
        reconnectTime: 5000 /* five second */,
        reconnectRetryTimeExponent: 1.5,
        maxReconnectionTime: 3_600_000 /* one hour */
      },
      syncingReconnection: {
        reconnectTime: 1000 /* one second */,
        reconnectRetryTimeExponent: 1.2,
        maxReconnectionTime: 3_600_000 /* one hour */
      },

      // snapshot stream options
      tmpDownloadFolder: staticConfigs.tmpDownloadFolder,
      // download entities retry
      requestMaxRetries: 10,
      requestRetryWaitTime: 5000,

      // pointer chagnes stream options
      // time between every poll to /pointer-changes
      pointerChangesWaitTime: 5000
    }
  )

  const synchronizationState = createSynchronizationState({ logs })

  const retryFailedDeployments = createRetryFailedDeployments({
    env,
    metrics,
    staticConfigs,
    fetcher,
    downloadQueue,
    logs,
    deployer,
    contentCluster,
    failedDeployments,
    storage
  })

  const snapshotGenerator = createSnapshotGenerator({
    logs,
    fs,
    metrics,
    staticConfigs,
    storage,
    database,
    denylist,
    snapshotManager,
    clock
  })

  const controller = new Controller(
    {
      challengeSupervisor,
      snapshotManager,
      deployer,
      logs,
      metrics,
      database,
      sequentialExecutor,
      activeEntities,
      denylist,
      fs,
      snapshotGenerator,
      failedDeployments,
      contentCluster,
      synchronizationState
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
    deployedEntitiesBloomFilter,
    controller,
    synchronizer,
    synchronizationState,
    challengeSupervisor,
    snapshotManager,
    contentCluster,
    failedDeployments,
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
    l1Provider,
    l2Provider,
    fs,
    snapshotGenerator,
    processedSnapshotStorage,
    clock,
    snapshotStorage,
    config
  }
}
