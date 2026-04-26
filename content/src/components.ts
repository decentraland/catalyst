import { createFolderBasedFileSystemContentStorage, createFsComponent } from '@dcl/catalyst-storage'
import { EntityType, EthAddress } from '@dcl/schemas'
import { createSynchronizer } from '@dcl/snapshots-fetcher'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { createTracedFetcherComponent } from '@dcl/traced-fetch-component'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createHttpTracerComponent } from '@well-known-components/http-tracer-component'
import { createTracerComponent } from '@well-known-components/tracer-component'
import { createServerComponent, instrumentHttpServerWithPromClientRegistry } from '@dcl/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent } from '@dcl/metrics'
import { HTTPProvider } from 'eth-connect'
import ms from 'ms'
import path from 'path'
import { L1Network } from '@dcl/catalyst-contracts'
import { CURRENT_VERSION, CURRENT_COMMIT_HASH, Environment, EnvironmentConfig } from './Environment'
import { splitByCommaTrimAndRemoveEmptyElements } from './logic/config-helpers'
import { metricsDeclaration } from './metrics'
import { createMigrationExecutor } from './migrations/migration-executor'
import { createActiveEntitiesRepository } from './adapters/active-entities-repository'
import { createActiveEntitiesComponent } from './logic/active-entities'
import { createContentFilesRepository } from './adapters/content-files-repository'
import { createCustomDAOComponent, createDAOComponent } from './adapters/dao-client'
import { createDeploymentsRepository } from './adapters/deployments-repository'
import { createFailedDeploymentsRepository } from './adapters/failed-deployments-repository'
import { createPointersRepository } from './adapters/pointers-repository'
import { createSnapshotsRepository } from './adapters/snapshots-repository'
import { createDenylist } from './adapters/denylist'
import { createDeployRateLimiter } from './adapters/deploy-rate-limiter'
import { createDeployedEntitiesBloomFilter } from './adapters/deployed-entities-bloom-filter'
import { createDeploymentService } from './logic/deployment-service'
import { createPointerLockManager } from './logic/pointer-lock-manager'
import { createFailedDeployments } from './ports/failedDeployments'
import { createDatabaseComponent } from './ports/postgres'
import { createProcessedSnapshotStorage } from './ports/processedSnapshotStorage'
import { createSequentialTaskExecutor } from './adapters/sequential-task-executor'
import { createSnapshotGenerator } from './ports/snapshotGenerator'
import { createSnapshotStorage } from './ports/snapshotStorage'
import { createSynchronizationState } from './adapters/synchronization-state'
import { createSystemProperties } from './adapters/system-properties'
import { GarbageCollectionManager } from './service/garbage-collection/GarbageCollectionManager'
import { PointerManager } from './logic/pointer-manager'
import { ChallengeSupervisor } from './logic/challenge-supervisor'
import { createContentCluster } from './logic/peer-cluster'
import { createBatchDeployerComponent } from './logic/batch-deployer'
import { createRetryFailedDeployments } from './logic/retry-failed-deployments'
import { createContentValidator } from './adapters/content-validator'
import { createAuthenticator } from './logic/authenticator'
import { createServerValidator } from './logic/server-validator'
import { AppComponents, GlobalContext } from './types'
import { createJobComponent } from '@dcl/job-component'
import { createDeploymentsComponent } from './logic/deployments'

export async function initComponentsWithEnv(env: Environment): Promise<AppComponents> {
  const config = env
  const metrics = await createMetricsComponent(metricsDeclaration, { config })
  const tracer = createTracerComponent()
  const logs = await createLogComponent({ config, tracer })

  const baseFetcher = createFetchComponent({
    defaultHeaders: {
      'User-Agent': `content-server/${CURRENT_COMMIT_HASH} (+https://github.com/decentraland/catalyst)`,
      Origin: env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
    },
    defaultFetcherOptions: { timeout: ms(env.getConfig<string>(EnvironmentConfig.FETCH_REQUEST_TIMEOUT)) }
  })
  const fetcher = await createTracedFetcherComponent({ tracer, fetchComponent: baseFetcher })

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

  const l1HttpProviderUrl: string = env.getConfig(EnvironmentConfig.L1_HTTP_PROVIDER_URL)
  const l2HttpProviderUrl: string = env.getConfig(EnvironmentConfig.L2_HTTP_PROVIDER_URL)

  const l2Network = ethNetwork === 'mainnet' ? 'polygon' : 'amoy'

  const l1Provider = new HTTPProvider(
    l1HttpProviderUrl || `https://rpc.decentraland.org/${encodeURIComponent(ethNetwork)}?project=catalyst-content`,
    {
      fetch: fetcher.fetch
    }
  )
  const l2Provider = new HTTPProvider(
    l2HttpProviderUrl || `https://rpc.decentraland.org/${encodeURIComponent(l2Network)}?project=catalyst-content`,
    {
      fetch: fetcher.fetch
    }
  )

  const database = await createDatabaseComponent({ logs, env, metrics })

  const activeEntitiesRepository = createActiveEntitiesRepository()
  const contentFilesRepository = createContentFilesRepository()
  const deploymentsRepository = createDeploymentsRepository()
  const failedDeploymentsRepository = createFailedDeploymentsRepository()
  const pointersRepository = createPointersRepository()
  const snapshotsRepository = createSnapshotsRepository()

  const sequentialExecutor = createSequentialTaskExecutor({ metrics, logs })

  const systemProperties = createSystemProperties({ database })

  const challengeSupervisor = new ChallengeSupervisor()

  const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const storage = await createFolderBasedFileSystemContentStorage({ fs, logs }, contentFolder, {
    decompressCacheTTL: env.getConfig(EnvironmentConfig.STORAGE_DECOMPRESS_CACHE_TTL),
    decompressCacheMaxSize: env.getConfig(EnvironmentConfig.STORAGE_DECOMPRESS_CACHE_MAX_SIZE),
    decompressCacheEvictionInterval: env.getConfig(EnvironmentConfig.STORAGE_DECOMPRESS_CACHE_EVICTION_INTERVAL)
  })

  const customDAO: string = env.getConfig(EnvironmentConfig.CUSTOM_DAO) ?? ''
  const daoClient =
    customDAO.trim().length === 0
      ? await createDAOComponent({ l1Provider }, ethNetwork as L1Network)
      : createCustomDAOComponent(customDAO)

  const decentralandAddresses = !!env.getConfig(EnvironmentConfig.ADDITIONAL_DECENTRALAND_ADDRESS)
    ? [
        env.getConfig(EnvironmentConfig.DECENTRALAND_ADDRESS),
        env.getConfig(EnvironmentConfig.ADDITIONAL_DECENTRALAND_ADDRESS)
      ]
    : [env.getConfig(EnvironmentConfig.DECENTRALAND_ADDRESS)]
  const authenticator = createAuthenticator(l1Provider, decentralandAddresses as EthAddress[])

  const contentCluster = createContentCluster(
    {
      daoClient,
      logs,
      env
    },
    env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL)
  )

  // TODO: this should be in the src/logic folder. It is not a component
  const pointerManager = new PointerManager()

  const failedDeployments = await createFailedDeployments({ metrics, database })

  const deployRateLimiter = createDeployRateLimiter(
    { logs, metrics },
    {
      defaultTtl: env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL) ?? ms('1m'),
      defaultMax: env.getConfig(EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX) ?? 300,
      entitiesConfigTtl:
        env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_TTL) ?? new Map(),
      entitiesConfigMax:
        env.getConfig<Map<EntityType, number>>(EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_MAX) ?? new Map(),
      entitiesConfigUnchangedTtl: new Map([[EntityType.PROFILE, ms('5m')]]) // ms, converted to seconds internally
    }
  )

  const validator = await createContentValidator({
    storage,
    authenticator,
    env,
    logs,
    metrics,
    config,
    fetcher,
    l1Provider,
    l2Provider
  })

  const serverValidator = createServerValidator({ failedDeployments })

  const deployedEntitiesBloomFilter = createDeployedEntitiesBloomFilter({ database, logs })
  const deployments = createDeploymentsComponent({ database, logs })
  const activeEntities = createActiveEntitiesComponent({
    database,
    env,
    logs,
    metrics,
    denylist,
    sequentialExecutor,
    deployments
  })

  const pointerLockManager = createPointerLockManager()

  const deployer = createDeploymentService({
    metrics,
    storage,
    failedDeployments,
    deployRateLimiter,
    pointerManager,
    pointerLockManager,
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

  const garbageCollectionManager = new GarbageCollectionManager(
    { database, metrics, logs, storage, systemProperties, activeEntities },
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

  const processedSnapshotStorage = createProcessedSnapshotStorage({ database, logs })

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
      failedDeployments
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

  const materializedViewUpdateJob = createJobComponent(
    { logs },
    deployments.updateMaterializedViews,
    1000 * 60 * 60 * 24, // 24 hours
    {
      startupDelay: 10 * 60 * 1000 // 10 minutes
    }
  )

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

  const synchronizationState = createSynchronizationState({ logs, metrics })

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
    denylist
  })

  const migrationManager = createMigrationExecutor({ logs, env })

  env.logConfigValues(logs.getLogger('Environment'))

  const _server = await createServerComponent<GlobalContext>(
    { config, logs },
    {
      cors: {
        origin: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'TRACE', 'PATCH', 'OPTION'],
        allowedHeaders: ['Cache-Control', 'Content-Type', 'Origin', 'Accept', 'User-Agent', 'X-Upload-Origin'],
        credentials: true,
        maxAge: 86400
      }
    }
  )

  let started = false
  const server = {
    ..._server,
    start: async (options: any) => {
      started = true
      if (_server.start) {
        await _server.start(options)
      }
    },
    stop: async () => {
      if (started && _server.stop) {
        return _server.stop()
      }
    }
  }

  const buildInfo = {
    version: CURRENT_VERSION,
    commitHash: CURRENT_COMMIT_HASH,
    ethNetwork: env.getConfig(EnvironmentConfig.ETH_NETWORK) as string
  }
  metrics.observe('dcl_content_server_build_info', buildInfo, 1)

  // Registers tracing middleware as a side effect (wraps each request in a trace span).
  // Registered before metrics so trace context is available to the metrics layer.
  createHttpTracerComponent({ server, tracer })

  await instrumentHttpServerWithPromClientRegistry({ server, metrics, config, registry: metrics.registry! })

  return {
    env,
    materializedViewUpdateJob,
    database,
    contentFilesRepository,
    deploymentsRepository,
    failedDeploymentsRepository,
    activeEntitiesRepository,
    pointersRepository,
    snapshotsRepository,
    deployer,
    pointerLockManager,
    metrics,
    fetcher,
    logs,
    staticConfigs,
    batchDeployer,
    downloadQueue,
    deployedEntitiesBloomFilter,
    synchronizer,
    synchronizationState,
    challengeSupervisor,
    contentCluster,
    failedDeployments,
    deployRateLimiter,
    pointerManager,
    storage,
    authenticator,
    migrationManager,
    validator,
    serverValidator,
    garbageCollectionManager,
    systemProperties,
    daoClient,
    server,
    retryFailedDeployments,
    deployments,
    activeEntities,
    sequentialExecutor,
    denylist,
    fs,
    snapshotGenerator,
    processedSnapshotStorage,
    snapshotStorage,
    config,
    l1Provider,
    tracer
  }
}
