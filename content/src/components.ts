import { createCatalystDeploymentStream } from '@dcl/snapshots-fetcher'
import { createJobLifecycleManagerComponent } from '@dcl/snapshots-fetcher/dist/job-lifecycle-manager'
import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import path from 'path'
import { Controller } from './controller/Controller'
import { ActiveDenylist } from './denylist/ActiveDenylist'
import { DenylistServiceDecorator } from './denylist/DenylistServiceDecorator'
import { Environment, EnvironmentConfig } from './Environment'
import { FetcherFactory } from './helpers/FetcherFactory'
import { metricsDeclaration } from './metrics'
import { MigrationManagerFactory } from './migrations/MigrationManagerFactory'
import { createBloomFilterComponent } from './ports/bloomFilter'
// import { createBloomFilterComponent } from './ports/bloomFilter'
import { createFetchComponent } from './ports/fetcher'
import { createDatabaseComponent } from './ports/postgres'
import { RepositoryFactory } from './repository/RepositoryFactory'
import { AccessCheckerImplFactory } from './service/access/AccessCheckerImplFactory'
import { AuthenticatorFactory } from './service/auth/AuthenticatorFactory'
import { DeploymentManager } from './service/deployments/DeploymentManager'
import { FailedDeploymentsManager } from './service/errors/FailedDeploymentsManager'
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
import { ClusterSynchronizationManager } from './service/synchronization/SynchronizationManager'
import { SystemPropertiesManager } from './service/system-properties/SystemProperties'
import { ValidatorFactory } from './service/validations/ValidatorFactory'
import { ContentStorageFactory } from './storage/ContentStorageFactory'
import { AppComponents } from './types'

export async function initComponentsWithEnv(env: Environment): Promise<AppComponents> {
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const repository = await RepositoryFactory.create({ env, metrics })
  const logs = createLogComponent()
  const fetcher = createFetchComponent()
  const staticConfigs = {
    contentStorageFolder: path.join(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
  }

  const database = await createDatabaseComponent(
    { logs },
    {
      port: env.getConfig<number>(EnvironmentConfig.PSQL_PORT),
      host: env.getConfig<string>(EnvironmentConfig.PSQL_HOST),
      database: env.getConfig<string>(EnvironmentConfig.PSQL_DATABASE),
      user: env.getConfig<string>(EnvironmentConfig.PSQL_USER),
      password: env.getConfig<string>(EnvironmentConfig.PSQL_PASSWORD),
      idleTimeoutMillis: env.getConfig<number>(EnvironmentConfig.PG_IDLE_TIMEOUT),
      query_timeout: env.getConfig<number>(EnvironmentConfig.PG_QUERY_TIMEOUT)
    }
  )

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
      logs
    },
    env.getConfig(EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL)
  )
  const deploymentManager = new DeploymentManager()

  // TODO: this should be in the src/logic folder. It is not a component
  const pointerManager = new PointerManager()

  const accessChecker = AccessCheckerImplFactory.create({ authenticator, catalystFetcher, env })
  const failedDeploymentsManager = new FailedDeploymentsManager()

  const validator = ValidatorFactory.create({ authenticator, accessChecker, env })

  let deployer: MetaverseContentService = ServiceFactory.create({
    metrics,
    storage,
    deploymentManager,
    failedDeploymentsManager,
    pointerManager,
    repository,
    validator,
    env,
    logs
  })

  const denylist = new ActiveDenylist(
    repository,
    authenticator,
    contentCluster,
    env.getConfig(EnvironmentConfig.ETH_NETWORK)
  )

  // TODO: move decorator logic to controllers
  if (!env.getConfig(EnvironmentConfig.DISABLE_DENYLIST)) {
    deployer = new DenylistServiceDecorator(deployer, denylist, repository)
  }

  const snapshotManager = new SnapshotManager(
    { database, metrics, staticConfigs, logs, deployer },
    env.getConfig(EnvironmentConfig.SNAPSHOT_FREQUENCY_IN_MILLISECONDS)
  )

  const garbageCollectionManager = new GarbageCollectionManager(
    { repository, deployer, systemPropertiesManager, metrics },
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION),
    env.getConfig(EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL)
  )

  const downloadQueue = createJobQueue({
    autoStart: true,
    concurrency: 10,
    timeout: 60000
  })

  const deployedEntitiesFilter = createBloomFilterComponent({
    sizeInBytes: 512
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
      deployedEntitiesFilter
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
          { logs, downloadQueue, fetcher, metrics, deployer: batchDeployer },
          {
            contentFolder: staticConfigs.contentStorageFolder,
            contentServer,

            // time between every poll to /pointer-changes
            pointerChangesWaitTime: 5000,

            // reconnection time for the whole catalyst
            reconnectTime: 1000,
            reconnectRetryTimeExponent: 1.2,

            // download entities retry
            requestMaxRetries: 10,
            requestRetryWaitTime: 5000
          }
        )
      }
    }
  )

  const synchronizationManager = new ClusterSynchronizationManager(
    {
      synchronizationJobManager,
      downloadQueue,
      deployer,
      fetcher,
      metrics,
      staticConfigs,
      batchDeployer,
      logs,
      contentCluster
    },
    env.getConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION)
  )

  const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK)

  const controller = new Controller(
    {
      synchronizationManager,
      denylist,
      challengeSupervisor,
      snapshotManager,
      deployer,
      logs
    },
    ethNetwork
  )

  const migrationManager = MigrationManagerFactory.create({ logs, env })

  const server = new Server({ controller, metrics, env })

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
    denylist,
    snapshotManager,
    contentCluster,
    deploymentManager,
    failedDeploymentsManager,
    pointerManager,
    storage,
    authenticator,
    migrationManager,
    validator,
    garbageCollectionManager,
    systemPropertiesManager,
    accessChecker,
    catalystFetcher,
    daoClient,
    server
  }
}
