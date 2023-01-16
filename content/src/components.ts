import { createTheGraphClient, L1Checker, L2Checker } from '@dcl/content-validator'
import { EntityType } from '@dcl/schemas'
import { createSynchronizer } from '@dcl/snapshots-fetcher'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { IFetchComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { HTTPProvider } from 'eth-connect'
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
import { createFileSystemContentStorage } from './ports/contentStorage/fileSystemContentStorage'
import { createDenylist } from './ports/denylist'
import { createDeployedEntitiesBloomFilter } from './ports/deployedEntitiesBloomFilter'
import { createDeployRateLimiter } from './ports/deployRateLimiterComponent'
import { createFailedDeployments } from './ports/failedDeployments'
import { createFetchComponent } from './ports/fetcher'
import { createFsComponent } from './ports/fs'
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
import { createExternalCalls, createSubGraphsComponent, createValidator } from './service/validations/validator'
import { AppComponents, ComponentsBuilder, ICheckerContract } from './types'
import { ethers } from 'ethers'
import {
  checkerAbi,
  checkerContracts,
  collectionFactoryContracts
  // collectionFactoryContracts,
  // landContracts,
  // registrarContracts,
  // thirdPartyContracts
} from '@dcl/catalyst-contracts'
import { providers } from '@0xsequence/multicall'

function createCheckerContract(provider: ethers.providers.Provider, network: string): ICheckerContract {
  const multicallProvider = new providers.MulticallProvider(provider)
  const contract = new ethers.Contract(checkerContracts[network], checkerAbi, multicallProvider)
  return contract as any
}

export const defaultComponentsBuilder = {
  createEthConnectProvider(fetcher: IFetchComponent, network: string): HTTPProvider {
    throw new Error('no')
    // return new HTTPProvider(`https://rpc.decentraland.org/${encodeURIComponent(network)}?project=catalyst-content`, {
    //   fetch: fetcher.fetch
    // })
  },
  createEthersProvider(network: string): ethers.providers.Provider {
    throw new Error('no')
    // return new ethers.providers.JsonRpcProvider(
    //   `https://rpc.decentraland.org/${encodeURIComponent(network)}?project=catalyst-content`
    // )
  },
  createL1Checker(provider: ethers.providers.Provider, network: string): L1Checker {
    const checker = createCheckerContract(provider, network)
    console.log(checker)
    throw new Error('no')
    // return {
    //   checkLAND(ethAddress: string, parcels: [number, number][], block: number): Promise<boolean[]> {
    //     const contracts = landContracts[network]
    //     return Promise.all(
    //       parcels.map(([x, y]) =>
    //         checker.checkLAND(ethAddress, contracts.landContractAddress, contracts.stateContractAddress, x, y, {
    //           blockTag: block
    //         })
    //       )
    //     )
    //   },
    //   checkNames(ethAddress: string, names: string[], block: number): Promise<boolean[]> {
    //     const registrar = registrarContracts[network]

    //     return Promise.all(names.map((name) => checker.checkName(ethAddress, registrar, name, { blockTag: block })))
    //   }
    // }
  },
  createL2Checker(provider: ethers.providers.Provider, network: string): L2Checker {
    const checker = createCheckerContract(provider, network)

    const { v2, v3 } = collectionFactoryContracts[network]

    const factories = [v2, v3]

    console.log(checker, factories)
    throw new Error('no')
    // return {
    //   async validateWearables(
    //     ethAddress: string,
    //     contractAddress: string,
    //     assetId: string,
    //     hash: string,
    //     block: number
    //   ): Promise<boolean> {
    //     return checker.validateWearables(ethAddress, factories, contractAddress, assetId, hash, { blockTag: block })
    //   },
    //   validateThirdParty(ethAddress: string, tpId: string, root: Buffer, block: number): Promise<boolean> {
    //     const registry = thirdPartyContracts[network]
    //     return checker.validateThirdParty(ethAddress, registry, tpId, new Uint8Array(root), { blockTag: block })
    //   }
    // }
  }
}

export async function initComponentsWithEnv(env: Environment, builder: ComponentsBuilder): Promise<AppComponents> {
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
  const l1EthConnectProvider = builder.createEthConnectProvider(fetcher, ethNetwork)
  const l2EthConnectProvider = builder.createEthConnectProvider(fetcher, l2Network)
  const l1EthersProvider = builder.createEthersProvider(ethNetwork)
  const l2EthersProvider = builder.createEthersProvider(l2Network)
  const l1Checker = builder.createL1Checker(l1EthersProvider, ethNetwork)
  const l2Checker = builder.createL2Checker(l2EthersProvider, l2Network)

  const database = await createDatabaseComponent({ logs, env, metrics })

  const sequentialExecutor = createSequentialTaskExecutor({ metrics, logs })

  const systemProperties = createSystemProperties({ database })

  const challengeSupervisor = new ChallengeSupervisor()

  const catalystFetcher = FetcherFactory.create({ env })
  const contentFolder = path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  const storage = await createFileSystemContentStorage({ fs }, contentFolder)

  const daoClient = await DAOClientFactory.create(env, l1EthConnectProvider)
  const authenticator = new ContentAuthenticator(
    l1EthConnectProvider,
    env.getConfig(EnvironmentConfig.DECENTRALAND_ADDRESS)
  )

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

  const subGraphs = await createSubGraphsComponent({
    env,
    metrics,
    logs,
    fetcher,
    l1EthersProvider,
    l2EthersProvider,
    l1Checker,
    l2Checker
  })
  const externalCalls = await createExternalCalls({
    storage,
    authenticator,
    catalystFetcher,
    env,
    logs
  })
  const theGraphClient = createTheGraphClient({ subGraphs, logs })
  const validator = createValidator({ config, externalCalls, logs, theGraphClient, subGraphs })
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
    { deployer, systemProperties, metrics, logs, storage, database, clock },
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
    l1EthConnectProvider,
    l2EthConnectProvider,
    l1EthersProvider,
    l2EthersProvider,
    l1Checker,
    l2Checker,
    fs,
    snapshotGenerator,
    processedSnapshotStorage,
    clock,
    snapshotStorage
  }
}
