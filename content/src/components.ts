import { createFolderBasedFileSystemContentStorage, createFsComponent } from '@dcl/catalyst-storage'
import { ValidateFn } from '@dcl/content-validator'
import { EntityType } from '@dcl/schemas'
import { createSynchronizer } from '@dcl/snapshots-fetcher'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createServerComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent, instrumentHttpServerWithMetrics } from '@well-known-components/metrics'
import { HTTPProvider } from 'eth-connect'
import ms from 'ms'
import path from 'path'
import { L1Network } from '@dcl/catalyst-contracts'
import { CURRENT_VERSION, CURRENT_COMMIT_HASH, Environment, EnvironmentConfig } from './Environment'
import { splitByCommaTrimAndRemoveEmptyElements } from './logic/config-helpers'
import { metricsDeclaration } from './metrics'
import { createMigrationExecutor } from './migrations/migration-executor'
import { createActiveEntitiesComponent } from './ports/activeEntities'
import { createClock } from './ports/clock'
import { createCustomDAOComponent, createDAOComponent } from './ports/dao-servers-getter'
import { createDenylist } from './ports/denylist'
import { createDeployRateLimiter } from './ports/deployRateLimiterComponent'
import { createDeployedEntitiesBloomFilter } from './ports/deployedEntitiesBloomFilter'
import { createDeployer } from './ports/deployer'
import { createFailedDeployments } from './ports/failedDeployments'
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
import { ChallengeSupervisor } from './service/synchronization/ChallengeSupervisor'
import { ContentCluster } from './service/synchronization/ContentCluster'
import { createBatchDeployerComponent } from './service/synchronization/batchDeployer'
import { createRetryFailedDeployments } from './service/synchronization/retryFailedDeployments'
import { createServerValidator } from './service/validations/server'
import {
  createExternalCalls,
  createIgnoreBlockchainValidator,
  createOnChainValidator,
  createSubgraphValidator
} from './service/validations/validator'
import { AppComponents, GlobalContext } from './types'

export async function initComponentsWithEnv(env: Environment): Promise<AppComponents> {
  const clock = createClock()
  const config = env
  const metrics = await createMetricsComponent(metricsDeclaration, { config })
  const logs = await createLogComponent({ config })

  const fetcher = createFetchComponent({
    defaultHeaders: {
      'User-Agent': `content-server/${CURRENT_COMMIT_HASH} (+https://github.com/decentraland/catalyst)`,
      Origin: env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
    },
    defaultFetcherOptions: { timeout: ms(env.getConfig<string>(EnvironmentConfig.FETCH_REQUEST_TIMEOUT)) }
  })

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
  const useOnChainValidator = !!(l1HttpProviderUrl && l2HttpProviderUrl)

  const l2Network = ethNetwork === 'mainnet' ? 'polygon' : 'mumbai'

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

  const sequentialExecutor = createSequentialTaskExecutor({ metrics, logs })

  const systemProperties = createSystemProperties({ database })

  const challengeSupervisor = new ChallengeSupervisor()

  const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const storage = await createFolderBasedFileSystemContentStorage({ fs }, contentFolder)

  const customDAO: string = env.getConfig(EnvironmentConfig.CUSTOM_DAO) ?? ''
  const daoClient =
    customDAO.trim().length === 0
      ? await createDAOComponent({ l1Provider }, ethNetwork as L1Network)
      : createCustomDAOComponent(customDAO)

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
    env,
    logs
  })

  const ignoreBlockChainAccess = env.getConfig(EnvironmentConfig.IGNORE_BLOCKCHAIN_ACCESS_CHECKS) === 'true'

  let validate: ValidateFn
  if (ignoreBlockChainAccess) {
    validate = await createIgnoreBlockchainValidator({ logs, externalCalls })
  } else if (useOnChainValidator) {
    validate = await createOnChainValidator(
      {
        env,
        metrics,
        fetcher,
        config,
        externalCalls,
        logs
      },
      l1Provider,
      l2Provider
    )
  } else {
    validate = await createSubgraphValidator({
      env,
      metrics,
      fetcher,
      config,
      externalCalls,
      logs
    })
  }

  const validator = { validate }

  const serverValidator = createServerValidator({ failedDeployments, metrics, clock })

  const deployedEntitiesBloomFilter = createDeployedEntitiesBloomFilter({ database, logs, clock })
  const activeEntities = createActiveEntitiesComponent({ database, env, logs, metrics, denylist, sequentialExecutor })

  const deployer = createDeployer({
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
    denylist,
    clock
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
    start: async (options) => {
      started = true
      return _server.start && _server.start(options)
    },
    stop: async () => {
      if (started) {
        return _server.stop && _server.stop()
      }
    }
  }

  const buildInfo = {
    version: CURRENT_VERSION,
    commitHash: CURRENT_COMMIT_HASH,
    ethNetwork: env.getConfig(EnvironmentConfig.ETH_NETWORK) as string
  }
  metrics.observe('dcl_content_server_build_info', buildInfo, 1)

  await instrumentHttpServerWithMetrics({ server, metrics, config })

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
    externalCalls,
    validator,
    serverValidator,
    garbageCollectionManager,
    systemProperties,
    daoClient,
    server,
    retryFailedDeployments,
    activeEntities,
    sequentialExecutor,
    denylist,
    fs,
    snapshotGenerator,
    processedSnapshotStorage,
    clock,
    snapshotStorage,
    config,
    l1Provider
  }
}
