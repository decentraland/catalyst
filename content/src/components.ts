// =============================================================================
// External libraries
// =============================================================================
import { createFolderBasedFileSystemContentStorage, createFsComponent } from '@dcl/catalyst-storage'
import type { L1Network } from '@dcl/catalyst-contracts'
import { createServerComponent, instrumentHttpServerWithPromClientRegistry } from '@dcl/http-server'
import { createJobComponent } from '@dcl/job-component'
import { createMetricsComponent } from '@dcl/metrics'
import { EntityType, EthAddress } from '@dcl/schemas'
import { createSynchronizer } from '@dcl/snapshots-fetcher'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { createTracedFetcherComponent } from '@dcl/traced-fetch-component'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createHttpTracerComponent } from '@well-known-components/http-tracer-component'
import { createLogComponent } from '@well-known-components/logger'
import { createTracerComponent } from '@well-known-components/tracer-component'
import { HTTPProvider } from 'eth-connect'
import ms from 'ms'
import path from 'path'

// =============================================================================
// Infrastructure / config
// =============================================================================
import { CURRENT_COMMIT_HASH, CURRENT_VERSION, Environment, EnvironmentConfig } from './Environment'
import { metricsDeclaration } from './metrics'
import { createMigrationExecutor } from './migrations/migration-executor'

// =============================================================================
// Adapters — repositories (per-domain SQL)
// =============================================================================
import { createActiveEntitiesRepository } from './adapters/active-entities-repository'
import { createContentFilesRepository } from './adapters/content-files-repository'
import { createDeploymentsRepository } from './adapters/deployments-repository'
import { createFailedDeploymentsRepository } from './adapters/failed-deployments-repository'
import { createPointersRepository } from './adapters/pointers-repository'
import { createSnapshotsRepository } from './adapters/snapshots-repository'

// =============================================================================
// Adapters — external integrations & primitives
// =============================================================================
import { createContentValidator } from './adapters/content-validator'
import { createCustomDAOComponent, createDAOComponent } from './adapters/dao-client'
import { createDatabaseComponent } from './adapters/database'
import { createDenylist } from './adapters/denylist'
import { createDeployRateLimiter } from './adapters/deploy-rate-limiter'
import { createDeployedEntitiesBloomFilter } from './adapters/deployed-entities-bloom-filter'
import { createFailedDeployments } from './adapters/failed-deployments-cache'
import { createPointerLockManager } from './adapters/pointer-lock-manager'
import { createProcessedSnapshotStorage } from './adapters/processed-snapshot-storage'
import { createSnapshotGenerator } from './adapters/snapshot-generator'
import { createSnapshotStorage } from './adapters/snapshot-storage'
import { createSynchronizationState } from './adapters/synchronization-state'
import { createSystemProperties } from './adapters/system-properties'

// =============================================================================
// Logic components
// =============================================================================
import { createActiveEntitiesComponent } from './logic/active-entities'
import { createAuthenticator } from './logic/authenticator'
import { createBatchDeployerComponent } from './logic/batch-deployer'
import { ChallengeSupervisor } from './logic/challenge-supervisor'
import { splitByCommaTrimAndRemoveEmptyElements } from './logic/config-helpers'
import { createDeploymentsComponent, retryFailedDeploymentExecution } from './logic/deployments'
import { createDeploymentService } from './logic/deployment-service'
import { createFailedDeploymentsReporter } from './logic/failed-deployments-reporter'
import { createGarbageCollectionComponent } from './logic/garbage-collection'
import { createContentCluster } from './logic/peer-cluster'
import { PointerManager } from './logic/pointer-manager'
import { createRetryFailedDeploymentsScheduler } from './logic/retry-failed-deployments'
import { createSequentialTaskExecutor } from './logic/sequential-task-executor'
import { createServerValidator } from './logic/server-validator'

// =============================================================================
// Types
// =============================================================================
import { AppComponents, GlobalContext } from './types'

/**
 * Wires up every component the content server needs. The order below is also
 * the rough dependency order: each block depends only on what came before it.
 *
 * Sections:
 *   1. Bootstrap primitives (config, metrics, tracer, logs, fetch, fs)
 *   2. Static config + filesystem layout (denylist, content/tmp folders)
 *   3. Blockchain providers (L1/L2)
 *   4. Database + per-domain repositories
 *   5. Stateful adapters (sequential executor, system properties, challenge supervisor)
 *   6. Storage + DAO client + authenticator
 *   7. Domain logic (cluster, pointer manager, validators, active entities, ...)
 *   8. Deploy pipeline (deployment-service + lock manager + bloom filter)
 *   9. Background workers (GC, batch deployer, snapshot generator, retry)
 *   10. Synchronizer + sync state
 *   11. HTTP server
 */
export async function initComponentsWithEnv(env: Environment): Promise<AppComponents> {
  // ---------------------------------------------------------------------------
  // 1. Bootstrap primitives
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 2. Static config + filesystem layout
  // ---------------------------------------------------------------------------
  const denylist = await createDenylist({ env, logs, fs, fetcher })
  await denylist.reload()

  const denylistReloadJob = createJobComponent({ logs }, denylist.reload, 120_000, {
    startupDelay: 120_000
  })

  const contentStorageFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const tmpDownloadFolder = path.join(contentStorageFolder, '_tmp')
  await fs.mkdir(tmpDownloadFolder, { recursive: true })
  const staticConfigs = {
    contentStorageFolder,
    tmpDownloadFolder
  }

  // ---------------------------------------------------------------------------
  // 3. Blockchain providers
  // ---------------------------------------------------------------------------
  const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK)
  const l1HttpProviderUrl: string = env.getConfig(EnvironmentConfig.L1_HTTP_PROVIDER_URL)
  const l2HttpProviderUrl: string = env.getConfig(EnvironmentConfig.L2_HTTP_PROVIDER_URL)
  const l2Network = ethNetwork === 'mainnet' ? 'polygon' : 'amoy'

  const l1Provider = new HTTPProvider(
    l1HttpProviderUrl || `https://rpc.decentraland.org/${encodeURIComponent(ethNetwork)}?project=catalyst-content`,
    { fetch: fetcher.fetch }
  )
  const l2Provider = new HTTPProvider(
    l2HttpProviderUrl || `https://rpc.decentraland.org/${encodeURIComponent(l2Network)}?project=catalyst-content`,
    { fetch: fetcher.fetch }
  )

  // ---------------------------------------------------------------------------
  // 4. Database + per-domain repositories
  // ---------------------------------------------------------------------------
  const database = await createDatabaseComponent({ logs, env, metrics })

  const activeEntitiesRepository = createActiveEntitiesRepository()
  const contentFilesRepository = createContentFilesRepository()
  const deploymentsRepository = createDeploymentsRepository()
  const failedDeploymentsRepository = createFailedDeploymentsRepository()
  const pointersRepository = createPointersRepository()
  const snapshotsRepository = createSnapshotsRepository()

  // ---------------------------------------------------------------------------
  // 5. Stateful adapters
  // ---------------------------------------------------------------------------
  const sequentialExecutor = createSequentialTaskExecutor({ metrics, logs })
  const systemProperties = createSystemProperties({ database })
  const challengeSupervisor = new ChallengeSupervisor()

  // ---------------------------------------------------------------------------
  // 6. Storage + DAO client + authenticator
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 7. Domain logic
  // ---------------------------------------------------------------------------
  const contentCluster = createContentCluster(
    { daoClient, logs, env },
    env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL)
  )

  const pointerManager = new PointerManager()

  const failedDeployments = await createFailedDeployments({ metrics, database, failedDeploymentsRepository })
  const failedDeploymentsReporter = createFailedDeploymentsReporter({
    database,
    failedDeployments,
    failedDeploymentsRepository
  })

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

  const deployedEntitiesBloomFilter = createDeployedEntitiesBloomFilter({ database, logs, deploymentsRepository })
  const deployments = createDeploymentsComponent({ database, logs })
  const activeEntities = createActiveEntitiesComponent({
    database,
    env,
    logs,
    metrics,
    denylist,
    sequentialExecutor,
    deployments,
    pointersRepository,
    activeEntitiesRepository,
    contentFilesRepository
  })

  // ---------------------------------------------------------------------------
  // 8. Deploy pipeline
  // ---------------------------------------------------------------------------
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
    denylist,
    deploymentsRepository,
    contentFilesRepository
  })

  // ---------------------------------------------------------------------------
  // 9. Background workers
  // ---------------------------------------------------------------------------
  const garbageCollectionManager = createGarbageCollectionComponent(
    { database, metrics, logs, storage, systemProperties, activeEntities, contentFilesRepository },
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION),
    env.getConfig(EnvironmentConfig.PROFILE_DURATION)
  )

  const garbageCollectionJob = createJobComponent(
    { logs },
    garbageCollectionManager.performSweep,
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL),
    {
      onError: (err) => logs.getLogger('GarbageCollectionJob').error(err as Error)
    }
  )

  const downloadQueue = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 60000
  })

  const ignoredTypes = splitByCommaTrimAndRemoveEmptyElements(
    env.getConfig<string>(EnvironmentConfig.SYNC_IGNORED_ENTITY_TYPES)
  )

  const processedSnapshotStorage = createProcessedSnapshotStorage({ database, logs, snapshotsRepository })

  const batchDeployer = createBatchDeployerComponent(
    {
      logs,
      downloadQueue,
      fetcher,
      database,
      metrics,
      deployer,
      staticConfigs,
      deployedEntitiesBloomFilter,
      storage,
      failedDeployments,
      failedDeploymentsReporter,
      deploymentsRepository
    },
    {
      ignoredTypes: new Set(ignoredTypes),
      queueOptions: {
        autoStart: true,
        concurrency: 10,
        timeout: 100000
      },
      profileDuration: env.getConfig(EnvironmentConfig.PROFILE_DURATION)
    }
  )

  const snapshotStorage = createSnapshotStorage({ database, snapshotsRepository })

  const materializedViewUpdateJob = createJobComponent(
    { logs },
    deployments.updateMaterializedViews,
    1000 * 60 * 60 * 24, // 24 hours
    { startupDelay: 10 * 60 * 1000 /* 10 minutes */ }
  )

  // ---------------------------------------------------------------------------
  // 10. Synchronizer + sync state
  // ---------------------------------------------------------------------------
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

  // Built but intentionally NOT included in the returned components map: the WKC
  // framework auto-starts every IJobComponent it finds there. The scheduler below
  // owns this job and starts it manually after sync bootstrap finishes.
  const retryFailedDeploymentsJob = createJobComponent(
    { logs },
    async () => {
      await retryFailedDeploymentExecution(
        {
          metrics,
          staticConfigs,
          fetcher,
          downloadQueue,
          logs,
          deployer,
          contentCluster,
          failedDeployments,
          failedDeploymentsReporter,
          storage
        },
        logs.getLogger('RetryFailedDeployments')
      )
    },
    env.getConfig<number>(EnvironmentConfig.RETRY_FAILED_DEPLOYMENTS_DELAY_TIME),
    {
      onError: (err) => logs.getLogger('RetryFailedDeploymentsJob').error(err as Error)
    }
  )

  const retryFailedDeployments = createRetryFailedDeploymentsScheduler(retryFailedDeploymentsJob)

  const snapshotGenerator = createSnapshotGenerator({
    logs,
    fs,
    metrics,
    staticConfigs,
    storage,
    database,
    denylist,
    snapshotsRepository
  })

  const snapshotGenerationJob = createJobComponent({ logs }, snapshotGenerator.generateSnapshots, ms('6h'), {
    startupDelay: 0,
    onError: (err) => logs.getLogger('SnapshotGenerationJob').error(err as Error)
  })

  const migrationManager = createMigrationExecutor({ logs, env })

  env.logConfigValues(logs.getLogger('Environment'))

  // ---------------------------------------------------------------------------
  // 11. HTTP server
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------
  return {
    activeEntities,
    activeEntitiesRepository,
    authenticator,
    batchDeployer,
    challengeSupervisor,
    config,
    contentCluster,
    contentFilesRepository,
    daoClient,
    database,
    denylist,
    denylistReloadJob,
    deployedEntitiesBloomFilter,
    deployer,
    deployments,
    deploymentsRepository,
    deployRateLimiter,
    downloadQueue,
    env,
    failedDeployments,
    failedDeploymentsReporter,
    failedDeploymentsRepository,
    fetcher,
    fs,
    garbageCollectionJob,
    garbageCollectionManager,
    l1Provider,
    logs,
    materializedViewUpdateJob,
    metrics,
    migrationManager,
    pointerLockManager,
    pointerManager,
    pointersRepository,
    processedSnapshotStorage,
    retryFailedDeployments,
    sequentialExecutor,
    server,
    serverValidator,
    snapshotGenerationJob,
    snapshotGenerator,
    snapshotsRepository,
    snapshotStorage,
    staticConfigs,
    storage,
    synchronizationState,
    synchronizer,
    systemProperties,
    tracer,
    validator
  }
}
