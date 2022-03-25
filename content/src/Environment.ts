import { DECENTRALAND_ADDRESS } from '@dcl/catalyst-node-commons'
import { EntityType, EntityVersion } from 'dcl-catalyst-commons'
import log4js from 'log4js'
import ms from 'ms'
import { initComponentsWithEnv } from './components'
import { RepositoryQueue } from './repository/RepositoryQueue'
import { AppComponents, parseEntityType } from './types'

export const CURRENT_CONTENT_VERSION: EntityVersion = EntityVersion.V3
const DEFAULT_STORAGE_ROOT_FOLDER = 'storage'
const DEFAULT_SERVER_PORT = 6969
const DEFAULT_DENYLIST_FILE_NAME = 'denylist.txt'
const DEFAULT_DENYLIST_URLS = 'https://config.decentraland.org/denylist'

const DEFAULT_FOLDER_MIGRATION_MAX_CONCURRENCY = 1000
export const DEFAULT_ENTITIES_CACHE_SIZE = 150000
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
export const DEFAULT_THIRD_PARTY_REGISTRY_SUBGRAPH_MATIC_MUMBAI =
  'https://api.thegraph.com/subgraphs/name/decentraland/tpr-matic-mumbai'
export const DEFAULT_THIRD_PARTY_REGISTRY_SUBGRAPH_MATIC_MAINNET =
  'https://api.thegraph.com/subgraphs/name/decentraland/tpr-matic-mainnet'
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

  constructor(otherEnv?: Environment) {
    this.configs = otherEnv ? new Map(otherEnv.configs) : new Map()
  }

  getConfig<T>(key: EnvironmentConfig): T {
    return this.configs.get(key)
  }

  setConfig<T>(key: EnvironmentConfig, value: T): Environment {
    this.configs.set(key, value)
    return this
  }

  logConfigValues() {
    Environment.LOGGER.info('These are the configuration values:')
    const sensitiveEnvs = [EnvironmentConfig.PSQL_PASSWORD, EnvironmentConfig.PSQL_USER]
    for (const [config, value] of this.configs.entries()) {
      if (!sensitiveEnvs.includes(config)) {
        Environment.LOGGER.info(`${EnvironmentConfig[config]}: ${this.printObject(value)}`)
      }
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

export enum EnvironmentConfig {
  STORAGE_ROOT_FOLDER,
  SERVER_PORT,
  LOG_REQUESTS,
  UPDATE_FROM_DAO_INTERVAL,
  SYNC_WITH_SERVERS_INTERVAL,
  CHECK_SYNC_RANGE,
  DECENTRALAND_ADDRESS,
  DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL,
  DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX,
  ETH_NETWORK,
  LOG_LEVEL,
  FETCH_REQUEST_TIMEOUT,
  USE_COMPRESSION_MIDDLEWARE,
  BOOTSTRAP_FROM_SCRATCH,
  REQUEST_TTL_BACKWARDS,
  LAND_MANAGER_SUBGRAPH_URL,
  COLLECTIONS_L1_SUBGRAPH_URL,
  COLLECTIONS_L2_SUBGRAPH_URL,
  THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL,
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
  SNAPSHOT_FREQUENCY_IN_MILLISECONDS,
  CUSTOM_DAO,
  DISABLE_SYNCHRONIZATION,
  SYNC_STREAM_TIMEOUT,
  CONTENT_SERVER_ADDRESS,
  REPOSITORY_QUEUE_MAX_CONCURRENCY,
  REPOSITORY_QUEUE_MAX_QUEUED,
  REPOSITORY_QUEUE_TIMEOUT,
  ENTITIES_CACHE_SIZE,
  BLOCKS_L1_SUBGRAPH_URL,
  BLOCKS_L2_SUBGRAPH_URL,
  VALIDATE_API,
  FOLDER_MIGRATION_MAX_CONCURRENCY,
  RETRY_FAILED_DEPLOYMENTS_DELAY_TIME,
  DEPLOYMENT_RATE_LIMIT_TTL,
  DEPLOYMENT_RATE_LIMIT_MAX,
  DENYLIST_FILE_NAME,
  DENYLIST_URLS
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

  withConfig(config: EnvironmentConfig, value: any): EnvironmentBuilder {
    this.baseEnv.setConfig(config, value)
    return this
  }

  async buildConfigAndComponents(): Promise<AppComponents> {
    const env = new Environment()

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.STORAGE_ROOT_FOLDER,
      () => process.env.STORAGE_ROOT_FOLDER ?? DEFAULT_STORAGE_ROOT_FOLDER
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.DENYLIST_FILE_NAME,
      () => process.env.DENYLIST_FILE_NAME ?? DEFAULT_DENYLIST_FILE_NAME
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.DENYLIST_URLS,
      () => process.env.DENYLIST_URLS ?? DEFAULT_DENYLIST_URLS
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.FOLDER_MIGRATION_MAX_CONCURRENCY,
      () => process.env.FOLDER_MIGRATION_MAX_CONCURRENCY ?? DEFAULT_FOLDER_MIGRATION_MAX_CONCURRENCY
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SERVER_PORT,
      () => process.env.CONTENT_SERVER_PORT ?? DEFAULT_SERVER_PORT
    )
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
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL, () =>
      Math.floor(ms((process.env.DEPLOYMENTS_DEFAULT_RATE_LIMIT_TTL ?? '1m') as string) / 1000)
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX,
      () => process.env.DEPLOYMENTS_DEFAULT_RATE_LIMIT_MAX ?? 300
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
      EnvironmentConfig.THIRD_PARTY_REGISTRY_L2_SUBGRAPH_URL,
      () =>
        process.env.COLLECTIONS_L2_SUBGRAPH_URL ??
        (process.env.ETH_NETWORK === 'mainnet'
          ? DEFAULT_THIRD_PARTY_REGISTRY_SUBGRAPH_MATIC_MAINNET
          : DEFAULT_THIRD_PARTY_REGISTRY_SUBGRAPH_MATIC_MUMBAI)
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
      process.env.PG_QUERY_TIMEOUT ? ms(process.env.PG_QUERY_TIMEOUT) : ms('180s')
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SNAPSHOT_FREQUENCY_IN_MILLISECONDS,
      () => process.env.SNAPSHOT_FREQUENCY_IN_MILLISECONDS ?? ms('6h')
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
      EnvironmentConfig.CONTENT_SERVER_ADDRESS,
      () =>
        process.env.CONTENT_SERVER_ADDRESS ||
        'http://localhost:' + env.getConfig<number>(EnvironmentConfig.SERVER_PORT).toString()
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

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.ENTITIES_CACHE_SIZE,
      () => process.env.ENTITIES_CACHE_SIZE ?? DEFAULT_ENTITIES_CACHE_SIZE
    )

    /*
     * These are configured as 'DEPLOYMENT_RATE_LIMIT_MAX_{ENTITY_TYPE}=MAX_SIZE'.
     * For example: 'DEPLOYMENT_RATE_LIMIT_MAX_PROFILE=300'
     */
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_MAX, () => {
      const rateLimitMaxConfig: Map<EntityType, number> = new Map(
        Object.entries(process.env)
          .filter(([name, value]) => name.startsWith('DEPLOYMENT_RATE_LIMIT_MAX_') && !!value)
          .map(([name, value]) => [
            parseEntityType(name.replace('DEPLOYMENT_RATE_LIMIT_MAX_', '')) as EntityType,
            value as any as number
          ])
      )
      return rateLimitMaxConfig ?? new Map()
    })
    /*
     * These are configured as 'DEPLOYMENT_RATE_LIMIT_TTL_{ENTITY_TYPE}=MAX_SIZE'.
     * For example: 'DEPLOYMENT_RATE_LIMIT_TTL_PROFILE=1m'
     */
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DEPLOYMENT_RATE_LIMIT_TTL, () => {
      const rateLimitTtlConfig: Map<EntityType, number> = new Map(
        Object.entries(process.env)
          .filter(([name, value]) => name.startsWith('DEPLOYMENT_RATE_LIMIT_TTL_') && !!value)
          .map(([name, value]) => [
            parseEntityType(name.replace('DEPLOYMENT_RATE_LIMIT_TTL_', '')) as EntityType,
            ms(value ?? '1m')
          ])
      )
      return rateLimitTtlConfig ?? new Map()
    })

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.VALIDATE_API, () => process.env.VALIDATE_API == 'true')

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.RETRY_FAILED_DEPLOYMENTS_DELAY_TIME,
      () => process.env.RETRY_FAILED_DEPLOYMENTS_DELAY_TIME ?? ms('15m')
    )

    return await initComponentsWithEnv(env)
  }

  private registerConfigIfNotAlreadySet(env: Environment, key: EnvironmentConfig, valueProvider: () => any): void {
    env.setConfig(key, this.baseEnv.getConfig(key) ?? valueProvider())
  }
}
