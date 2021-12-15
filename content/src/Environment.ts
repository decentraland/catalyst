import { DECENTRALAND_ADDRESS } from '@catalyst/commons'
import { createLogComponent } from '@well-known-components/logger'
import { EntityType, EntityVersion } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import ms from 'ms'
import NodeCache from 'node-cache'
import path from 'path'
import { ControllerFactory } from './controller/ControllerFactory'
import { DenylistFactory } from './denylist/DenylistFactory'
import { FetcherFactory } from './helpers/FetcherFactory'
import { metricsComponent } from './metrics'
import { MigrationManagerFactory } from './migrations/MigrationManagerFactory'
import { createFetchComponent } from './ports/fetcher'
import { createDatabaseComponent } from './ports/postgres'
import { RepositoryFactory } from './repository/RepositoryFactory'
import { RepositoryQueue } from './repository/RepositoryQueue'
import { AccessCheckerImplFactory } from './service/access/AccessCheckerImplFactory'
import { AuthenticatorFactory } from './service/auth/AuthenticatorFactory'
import { CacheManagerFactory } from './service/caching/CacheManagerFactory'
import { DeploymentManagerFactory } from './service/deployments/DeploymentManagerFactory'
import { FailedDeploymentsManager } from './service/errors/FailedDeploymentsManager'
import { GarbageCollectionManagerFactory } from './service/garbage-collection/GarbageCollectionManagerFactory'
import { PointerManagerFactory } from './service/pointers/PointerManagerFactory'
import { ServiceFactory } from './service/ServiceFactory'
import { SnapshotManager } from './service/snapshots/SnapshotManager'
import { ChallengeSupervisor } from './service/synchronization/ChallengeSupervisor'
import { DAOClientFactory } from './service/synchronization/clients/DAOClientFactory'
import { ClusterSynchronizationManagerFactory } from './service/synchronization/ClusterSynchronizationManagerFactory'
import { ContentClusterFactory } from './service/synchronization/ContentClusterFactory'
import { EventDeployerFactory } from './service/synchronization/EventDeployerFactory'
import { SystemPropertiesManagerFactory } from './service/system-properties/SystemPropertiesManagerFactory'
import { ValidatorFactory } from './service/validations/ValidatorFactory'
import { ContentStorageFactory } from './storage/ContentStorageFactory'
import { AppComponents } from './types'

export const CURRENT_CONTENT_VERSION: EntityVersion = EntityVersion.V3
const DEFAULT_STORAGE_ROOT_FOLDER = 'storage'
const DEFAULT_SERVER_PORT = 6969
export const DEFAULT_ETH_NETWORK = 'ropsten'
export const DEFAULT_LAND_MANAGER_SUBGRAPH_ROPSTEN =
  'https://api.thegraph.com/subgraphs/name/decentraland/land-manager-ropsten'
export const DEFAULT_LAND_MANAGER_SUBGRAPH_MAINNET = 'https://api.thegraph.com/subgraphs/name/decentraland/land-manager'
export const DEFAULT_COLLECTIONS_SUBGRAPH_ROPSTEN =
  'https://api.thegraph.com/subgraphs/name/decentraland/collections-ethereum-ropsten'
export const DEFAULT_COLLECTIONS_SUBGRAPH_MAINNET =
  'https://api.thegraph.com/subgraphs/name/decentraland/collections-ethereum-mainnet'
export const DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_MUMBAI =
  'https://api.thegraph.com/subgraphs/name/decentraland/collections-matic-mumbai'
export const DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_MAINNET =
  'https://api.thegraph.com/subgraphs/name/decentraland/collections-matic-mainnet'
export const DEFAULT_BLOCKS_SUBGRAPH_ROPSTEN =
  'https://api.thegraph.com/subgraphs/name/decentraland/blocks-ethereum-ropsten'
export const DEFAULT_BLOCKS_SUBGRAPH_MAINNET =
  'https://api.thegraph.com/subgraphs/name/decentraland/blocks-ethereum-mainnet'
export const DEFAULT_BLOCKS_SUBGRAPH_MATIC_MUMBAI =
  'https://api.thegraph.com/subgraphs/name/decentraland/blocks-matic-mumbai'
export const DEFAULT_BLOCKS_SUBGRAPH_MATIC_MAINNET =
  'https://api.thegraph.com/subgraphs/name/decentraland/blocks-matic-mainnet'

export const CURRENT_COMMIT_HASH = process.env.COMMIT_HASH ?? 'Unknown'
export const CURRENT_CATALYST_VERSION = process.env.CATALYST_VERSION ?? 'Unknown'
export const DEFAULT_DATABASE_CONFIG = {
  password: '12345678',
  user: 'postgres',
  database: 'content',
  host: 'localhost',
  schema: 'public',
  port: 5432
}
const DEFAULT_SYNC_STREAM_TIMEOUT = '10m'

export class Environment {
  private static readonly LOGGER = log4js.getLogger('Environment')
  private configs: Map<EnvironmentConfig, any>
  private beans: Map<Bean, any>

  constructor(otherEnv?: Environment) {
    this.configs = otherEnv ? new Map(otherEnv.configs) : new Map()
    this.beans = otherEnv ? new Map(otherEnv.beans) : new Map()
  }

  getConfig<T>(key: EnvironmentConfig): T {
    return this.configs.get(key)
  }

  setConfig<T>(key: EnvironmentConfig, value: T): Environment {
    this.configs.set(key, value)
    return this
  }

  getBean<T>(type: Bean): T {
    return this.beans.get(type)
  }

  registerBean<T>(type: Bean, bean: T): Environment {
    this.beans.set(type, bean)
    return this
  }

  logConfigValues() {
    Environment.LOGGER.info('These are the configuration values:')
    for (const [config, value] of this.configs.entries()) {
      Environment.LOGGER.info(`${EnvironmentConfig[config]}: ${this.printObject(value)}`)
    }
  }

  private printObject(object: any) {
    if (object instanceof Map) {
      let mapString: string = '{'
      object.forEach((value: string, key: string) => {
        mapString += `'${key}': ${value},`
      })
      mapString += '}'
      return mapString
    } else {
      return JSON.stringify(object)
    }
  }
}

export const enum Bean {
  STORAGE,
  SERVICE,
  CONTROLLER,
  POINTER_MANAGER,
  SEGMENT_IO_ANALYTICS,
  SQS_DEPLOYMENT_REPORTER,
  SYNCHRONIZATION_MANAGER,
  DAO_CLIENT,
  ACCESS_CHECKER,
  DEPLOYMENT_MANAGER,
  CONTENT_CLUSTER,
  EVENT_DEPLOYER,
  DENYLIST,
  AUTHENTICATOR,
  FAILED_DEPLOYMENTS_MANAGER,
  FETCHER,
  VALIDATOR,
  CHALLENGE_SUPERVISOR,
  REPOSITORY,
  DEPLOYMENTS_RATE_LIMIT_CACHE,
  MIGRATION_MANAGER,
  GARBAGE_COLLECTION_MANAGER,
  SYSTEM_PROPERTIES_MANAGER,
  SNAPSHOT_MANAGER,
  CACHE_MANAGER
}

export enum EnvironmentConfig {
  STORAGE_ROOT_FOLDER,
  SERVER_PORT,
  // @deprecated
  METRICS,
  LOG_REQUESTS,
  UPDATE_FROM_DAO_INTERVAL,
  SYNC_WITH_SERVERS_INTERVAL,
  CHECK_SYNC_RANGE,
  ALLOW_LEGACY_ENTITIES,
  DECENTRALAND_ADDRESS,
  DEPLOYMENTS_RATE_LIMIT_TTL,
  DEPLOYMENTS_RATE_LIMIT_MAX,
  ETH_NETWORK,
  LOG_LEVEL,
  FETCH_REQUEST_TIMEOUT,
  USE_COMPRESSION_MIDDLEWARE,
  BOOTSTRAP_FROM_SCRATCH,
  REQUEST_TTL_BACKWARDS,
  LAND_MANAGER_SUBGRAPH_URL,
  COLLECTIONS_L1_SUBGRAPH_URL,
  COLLECTIONS_L2_SUBGRAPH_URL,
  PROOF_OF_WORK,
  PSQL_PASSWORD,
  PSQL_USER,
  PSQL_DATABASE,
  PSQL_HOST,
  PSQL_SCHEMA,
  PSQL_PORT,
  PG_IDLE_TIMEOUT,
  PG_QUERY_TIMEOUT,
  GARBAGE_COLLECTION,
  GARBAGE_COLLECTION_INTERVAL,
  SNAPSHOT_FREQUENCY,
  SNAPSHOT_FREQUENCY_IN_MILLISECONDS,
  CUSTOM_DAO,
  DISABLE_SYNCHRONIZATION,
  SYNC_STREAM_TIMEOUT,
  DISABLE_DENYLIST,
  CONTENT_SERVER_ADDRESS,
  REPOSITORY_QUEUE_MAX_CONCURRENCY,
  REPOSITORY_QUEUE_MAX_QUEUED,
  REPOSITORY_QUEUE_TIMEOUT,
  CACHE_SIZES,
  BLOCKS_L1_SUBGRAPH_URL,
  BLOCKS_L2_SUBGRAPH_URL,
  VALIDATE_API
}

export class EnvironmentBuilder {
  private baseEnv: Environment
  constructor(other?: Environment | EnvironmentBuilder) {
    if (other) {
      if (other instanceof EnvironmentBuilder) {
        this.baseEnv = new Environment(other.baseEnv)
      } else {
        this.baseEnv = new Environment(other)
      }
    } else {
      this.baseEnv = new Environment()
    }
  }

  withBean(bean: Bean, value: any): EnvironmentBuilder {
    this.baseEnv.registerBean(bean, value)
    return this
  }

  withConfig(config: EnvironmentConfig, value: any): EnvironmentBuilder {
    this.baseEnv.setConfig(config, value)
    return this
  }

  async build(): Promise<{ env: Environment; components: AppComponents }> {
    const env = new Environment()

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.STORAGE_ROOT_FOLDER,
      () => process.env.STORAGE_ROOT_FOLDER ?? DEFAULT_STORAGE_ROOT_FOLDER
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SERVER_PORT,
      () => process.env.CONTENT_SERVER_PORT ?? DEFAULT_SERVER_PORT
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.METRICS, () => process.env.METRICS !== 'false')
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_REQUESTS, () => process.env.LOG_REQUESTS !== 'false')
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL,
      () => process.env.UPDATE_FROM_DAO_INTERVAL ?? ms('30m')
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL,
      () => process.env.SYNC_WITH_SERVERS_INTERVAL ?? ms('45s')
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.CHECK_SYNC_RANGE,
      () => process.env.CHECK_SYNC_RANGE ?? ms('20m')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DECENTRALAND_ADDRESS, () => DECENTRALAND_ADDRESS)
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DEPLOYMENTS_RATE_LIMIT_TTL, () =>
      Math.floor(ms((process.env.DEPLOYMENTS_RATE_LIMIT_TTL ?? '1m') as string) / 1000)
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.DEPLOYMENTS_RATE_LIMIT_MAX,
      () => process.env.DEPLOYMENTS_RATE_LIMIT_MAX ?? 100
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.ALLOW_LEGACY_ENTITIES,
      () => process.env.ALLOW_LEGACY_ENTITIES === 'true'
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.ETH_NETWORK,
      () => process.env.ETH_NETWORK ?? DEFAULT_ETH_NETWORK
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_LEVEL, () => process.env.LOG_LEVEL ?? 'info')
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.FETCH_REQUEST_TIMEOUT,
      () => process.env.FETCH_REQUEST_TIMEOUT ?? '2m'
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE,
      () => process.env.USE_COMPRESSION_MIDDLEWARE === 'true'
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.BOOTSTRAP_FROM_SCRATCH,
      () => process.env.BOOTSTRAP_FROM_SCRATCH === 'true'
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.REQUEST_TTL_BACKWARDS, () => ms('20m'))
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.LAND_MANAGER_SUBGRAPH_URL,
      () =>
        process.env.LAND_MANAGER_SUBGRAPH_URL ??
        (env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet'
          ? DEFAULT_LAND_MANAGER_SUBGRAPH_MAINNET
          : DEFAULT_LAND_MANAGER_SUBGRAPH_ROPSTEN)
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL,
      () =>
        process.env.COLLECTIONS_L1_SUBGRAPH_URL ??
        (env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet'
          ? DEFAULT_COLLECTIONS_SUBGRAPH_MAINNET
          : DEFAULT_COLLECTIONS_SUBGRAPH_ROPSTEN)
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.COLLECTIONS_L2_SUBGRAPH_URL,
      () =>
        process.env.COLLECTIONS_L2_SUBGRAPH_URL ??
        (process.env.ETH_NETWORK === 'mainnet'
          ? DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_MAINNET
          : DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_MUMBAI)
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.BLOCKS_L1_SUBGRAPH_URL,
      () =>
        process.env.BLOCKS_L1_SUBGRAPH_URL ??
        (env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet'
          ? DEFAULT_BLOCKS_SUBGRAPH_MAINNET
          : DEFAULT_BLOCKS_SUBGRAPH_ROPSTEN)
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.BLOCKS_L2_SUBGRAPH_URL,
      () =>
        process.env.BLOCKS_L2_SUBGRAPH_URL ??
        (process.env.ETH_NETWORK === 'mainnet'
          ? DEFAULT_BLOCKS_SUBGRAPH_MATIC_MAINNET
          : DEFAULT_BLOCKS_SUBGRAPH_MATIC_MUMBAI)
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PROOF_OF_WORK, () => process.env.PROOF_OF_WORK === 'true')
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_PASSWORD,
      () => process.env.POSTGRES_CONTENT_PASSWORD ?? DEFAULT_DATABASE_CONFIG.password
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_USER,
      () => process.env.POSTGRES_CONTENT_USER ?? DEFAULT_DATABASE_CONFIG.user
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_DATABASE,
      () => process.env.POSTGRES_CONTENT_DB ?? DEFAULT_DATABASE_CONFIG.database
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_HOST,
      () => process.env.POSTGRES_HOST ?? DEFAULT_DATABASE_CONFIG.host
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_SCHEMA,
      () => process.env.POSTGRES_SCHEMA ?? DEFAULT_DATABASE_CONFIG.schema
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.PSQL_PORT,
      () => process.env.POSTGRES_PORT ?? DEFAULT_DATABASE_CONFIG.port
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.GARBAGE_COLLECTION,
      () => process.env.GARBAGE_COLLECTION === 'true'
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.GARBAGE_COLLECTION_INTERVAL, () => ms('6h'))

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PG_IDLE_TIMEOUT, () =>
      process.env.PG_IDLE_TIMEOUT ? ms(process.env.PG_IDLE_TIMEOUT) : ms('30s')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PG_QUERY_TIMEOUT, () =>
      process.env.PG_QUERY_TIMEOUT ? ms(process.env.PG_QUERY_TIMEOUT) : ms('60s')
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SNAPSHOT_FREQUENCY,
      () =>
        new Map([
          [EntityType.SCENE, 100],
          [EntityType.PROFILE, 500],
          [EntityType.WEARABLE, 50]
        ])
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SNAPSHOT_FREQUENCY_IN_MILLISECONDS,
      () => process.env.SNAPSHOT_FREQUENCY_IN_MILLISECONDS ?? ms('1h')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.CUSTOM_DAO, () => process.env.CUSTOM_DAO)

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.DISABLE_SYNCHRONIZATION,
      () => process.env.DISABLE_SYNCHRONIZATION === 'true'
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SYNC_STREAM_TIMEOUT,
      () => process.env.SYNC_STREAM_TIMEOUT || DEFAULT_SYNC_STREAM_TIMEOUT
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.DISABLE_DENYLIST,
      () => process.env.DISABLE_DENYLIST === 'true'
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.CONTENT_SERVER_ADDRESS,
      () => process.env.CONTENT_SERVER_ADDRESS
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.REPOSITORY_QUEUE_MAX_CONCURRENCY,
      () => process.env.REPOSITORY_QUEUE_MAX_CONCURRENCY ?? RepositoryQueue.DEFAULT_MAX_CONCURRENCY
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.REPOSITORY_QUEUE_MAX_QUEUED,
      () => process.env.REPOSITORY_QUEUE_MAX_QUEUED ?? RepositoryQueue.DEFAULT_MAX_QUEUED
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.REPOSITORY_QUEUE_TIMEOUT,
      () => process.env.REPOSITORY_QUEUE_TIMEOUT ?? RepositoryQueue.DEFAULT_TIMEOUT
    )

    /*
     * These are configured as 'CACHE_{CACHE_NAME}_{ENTITY_TYPE}=MAX_SIZE'.
     * For example: 'CACHE_ENTITIES_BY_POINTERS_SCENE=1000'
     */
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.CACHE_SIZES,
      () => new Map(Object.entries(process.env).filter(([name]) => name.startsWith('CACHE')))
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.VALIDATE_API, () => process.env.VALIDATE_API == 'true')

    // Please put special attention on the bean registration order.
    // Some beans depend on other beans, so the required beans should be registered before

    const repository = await RepositoryFactory.create(env)
    const logs = createLogComponent()
    const fetcher = createFetchComponent()
    const metrics = metricsComponent
    const staticConfigs: AppComponents['staticConfigs'] = {
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

    await database.start()

    this.registerBeanIfNotAlreadySet(env, Bean.REPOSITORY, () => repository)
    this.registerBeanIfNotAlreadySet(env, Bean.SYSTEM_PROPERTIES_MANAGER, () =>
      SystemPropertiesManagerFactory.create(env)
    )
    this.registerBeanIfNotAlreadySet(env, Bean.CHALLENGE_SUPERVISOR, () => new ChallengeSupervisor())
    this.registerBeanIfNotAlreadySet(env, Bean.CACHE_MANAGER, () => CacheManagerFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.FETCHER, () => FetcherFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.DAO_CLIENT, () => DAOClientFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.AUTHENTICATOR, () => AuthenticatorFactory.create(env))
    const localStorage = await ContentStorageFactory.local(env)
    this.registerBeanIfNotAlreadySet(env, Bean.STORAGE, () => localStorage)
    this.registerBeanIfNotAlreadySet(env, Bean.CONTENT_CLUSTER, () => ContentClusterFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.DEPLOYMENT_MANAGER, () => DeploymentManagerFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.DENYLIST, () => DenylistFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.POINTER_MANAGER, () => PointerManagerFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.ACCESS_CHECKER, () => AccessCheckerImplFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.FAILED_DEPLOYMENTS_MANAGER, () => new FailedDeploymentsManager())
    const ttl = env.getConfig(EnvironmentConfig.DEPLOYMENTS_RATE_LIMIT_TTL) as number
    this.registerBeanIfNotAlreadySet(
      env,
      Bean.DEPLOYMENTS_RATE_LIMIT_CACHE,
      () => new NodeCache({ stdTTL: ttl, checkperiod: ttl })
    )
    this.registerBeanIfNotAlreadySet(env, Bean.VALIDATOR, () => ValidatorFactory.create(env))
    const deployer = ServiceFactory.create(env)
    this.registerBeanIfNotAlreadySet(env, Bean.SERVICE, () => deployer)
    this.registerBeanIfNotAlreadySet(
      env,
      Bean.SNAPSHOT_MANAGER,
      () =>
        new SnapshotManager(
          { database, metrics, staticConfigs, logs },
          env.getBean(Bean.SERVICE),
          env.getConfig(EnvironmentConfig.SNAPSHOT_FREQUENCY_IN_MILLISECONDS)
        )
    )
    this.registerBeanIfNotAlreadySet(env, Bean.GARBAGE_COLLECTION_MANAGER, () =>
      GarbageCollectionManagerFactory.create(env)
    )
    this.registerBeanIfNotAlreadySet(env, Bean.EVENT_DEPLOYER, () => EventDeployerFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.SYNCHRONIZATION_MANAGER, () =>
      ClusterSynchronizationManagerFactory.create(env)
    )
    this.registerBeanIfNotAlreadySet(env, Bean.CONTROLLER, () => ControllerFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.MIGRATION_MANAGER, () => MigrationManagerFactory.create(env))

    return {
      env,
      components: {
        database,
        deployer,
        metrics,
        fetcher,
        logs,
        staticConfigs
      }
    }
  }

  private registerConfigIfNotAlreadySet(env: Environment, key: EnvironmentConfig, valueProvider: () => any): void {
    env.setConfig(key, this.baseEnv.getConfig(key) ?? valueProvider())
  }

  private registerBeanIfNotAlreadySet(env: Environment, key: Bean, valueProvider: () => any): void {
    env.registerBean(key, this.baseEnv.getBean(key) ?? valueProvider())
  }
}
