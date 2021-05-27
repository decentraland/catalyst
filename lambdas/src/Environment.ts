import log4js from 'log4js'
import ms from 'ms'
import { OffChainWearablesManagerFactory } from './apis/collections/off-chain/OffChainWearablesManagerFactory'
import { EnsOwnershipFactory } from './apis/profiles/EnsOwnershipFactory'
import { WearablesOwnershipFactory } from './apis/profiles/WearablesOwnershipFactory'
import { DAOCacheFactory } from './service/dao/DAOCacheFactory'
import { getCommsServerUrl } from './utils/commons'
import { SmartContentClientFactory } from './utils/SmartContentClientFactory'
import { SmartContentServerFetcherFactory } from './utils/SmartContentServerFetcherFactory'
import { TheGraphClientFactory } from './utils/TheGraphClientFactory'

const DEFAULT_SERVER_PORT = 7070
export const DEFAULT_ETH_NETWORK = 'ropsten'
export const DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN =
  'https://api.thegraph.com/subgraphs/name/decentraland/marketplace-ropsten'
const DEFAULT_ENS_OWNER_PROVIDER_URL_MAINNET = 'https://api.thegraph.com/subgraphs/name/decentraland/marketplace'
export const DEFAULT_COLLECTIONS_SUBGRAPH_ROPSTEN =
  'https://api.thegraph.com/subgraphs/name/decentraland/collections-ethereum-ropsten'
export const DEFAULT_COLLECTIONS_SUBGRAPH_MAINNET =
  'https://api.thegraph.com/subgraphs/name/decentraland/collections-ethereum-mainnet'
export const DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_MUMBAI =
  'https://api.thegraph.com/subgraphs/name/decentraland/collections-matic-mumbai'
export const DEFAULT_COLLECTIONS_SUBGRAPH_MATIC_MAINNET =
  'https://api.thegraph.com/subgraphs/name/decentraland/collections-matic-mainnet'

const DEFAULT_MAX_SYNCHRONIZATION_TIME = '15m'
const DEFAULT_MAX_DEPLOYMENT_OBTENTION_TIME = '3s'

const DEFAULT_INTERNAL_COMMS_SERVER_URL: string = `http://comms-server:9000`
const DEFAULT_LAMBDAS_STORAGE_LOCATION = 'lambdas-storage'

export class Environment {
  private configs: Map<EnvironmentConfig, any> = new Map()
  private beans: Map<Bean, any> = new Map()

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

  private static instance: Environment
  static async getInstance(): Promise<Environment> {
    if (!Environment.instance) {
      // Create default instance
      Environment.instance = await new EnvironmentBuilder().build()
    }
    return Environment.instance
  }
}

export const enum Bean {
  SERVICE,
  CONTROLLER,
  SMART_CONTENT_SERVER_FETCHER,
  SMART_CONTENT_SERVER_CLIENT,
  DAO,
  ENS_OWNERSHIP,
  WEARABLES_OWNERSHIP,
  THE_GRAPH_CLIENT,
  OFF_CHAIN_MANAGER
}

export const enum EnvironmentConfig {
  SERVER_PORT,
  LOG_REQUESTS,
  CONTENT_SERVER_ADDRESS,
  COMMS_SERVER_ADDRESS,
  ENS_OWNER_PROVIDER_URL,
  COLLECTIONS_L1_SUBGRAPH_URL,
  COLLECTIONS_L2_SUBGRAPH_URL,
  COMMIT_HASH,
  CATALYST_VERSION,
  USE_COMPRESSION_MIDDLEWARE,
  LOG_LEVEL,
  ETH_NETWORK,
  LAMBDAS_STORAGE_LOCATION,
  PROFILE_NAMES_CACHE_MAX,
  PROFILE_NAMES_CACHE_TIMEOUT,
  PROFILE_WEARABLES_CACHE_MAX,
  PROFILE_WEARABLES_CACHE_TIMEOUT,
  MAX_SYNCHRONIZATION_TIME,
  MAX_DEPLOYMENT_OBTENTION_TIME,
  METRICS,
  OFF_CHAIN_WEARABLES_REFRESH_TIME
}

export class EnvironmentBuilder {
  private static readonly LOGGER = log4js.getLogger('EnvironmentBuilder')
  private baseEnv: Environment
  constructor(baseEnv?: Environment) {
    this.baseEnv = baseEnv ?? new Environment()
  }

  withConfig(config: EnvironmentConfig, value: any): EnvironmentBuilder {
    this.baseEnv.setConfig(config, value)
    return this
  }

  withBean(bean: Bean, value: any): EnvironmentBuilder {
    this.baseEnv.registerBean(bean, value)
    return this
  }

  async build(): Promise<Environment> {
    const env = new Environment()

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.SERVER_PORT,
      () => process.env.SERVER_PORT ?? DEFAULT_SERVER_PORT
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_REQUESTS, () => process.env.LOG_REQUESTS !== 'false')
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.CONTENT_SERVER_ADDRESS,
      () => process.env.CONTENT_SERVER_ADDRESS
    )

    const realCommsServerAddress = await getCommsServerUrl(
      EnvironmentBuilder.LOGGER,
      process.env.INTERNAL_COMMS_SERVER_ADDRESS ?? DEFAULT_INTERNAL_COMMS_SERVER_URL,
      process.env.COMMS_SERVER_ADDRESS
    )

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.COMMS_SERVER_ADDRESS, () => realCommsServerAddress)

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.ENS_OWNER_PROVIDER_URL,
      () =>
        process.env.ENS_OWNER_PROVIDER_URL ??
        (process.env.ETH_NETWORK === 'mainnet'
          ? DEFAULT_ENS_OWNER_PROVIDER_URL_MAINNET
          : DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN)
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.COLLECTIONS_L1_SUBGRAPH_URL,
      () =>
        process.env.COLLECTIONS_L1_SUBGRAPH_URL ??
        (process.env.ETH_NETWORK === 'mainnet'
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

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.COMMIT_HASH, () => process.env.COMMIT_HASH ?? 'Unknown')
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.CATALYST_VERSION,
      () => process.env.CATALYST_VERSION ?? 'Unknown'
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE,
      () => process.env.USE_COMPRESSION_MIDDLEWARE === 'true'
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_LEVEL, () => process.env.LOG_LEVEL ?? 'info')
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.ETH_NETWORK,
      () => process.env.ETH_NETWORK ?? DEFAULT_ETH_NETWORK
    )
    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.LAMBDAS_STORAGE_LOCATION,
      () => process.env.LAMBDAS_STORAGE_LOCATION ?? DEFAULT_LAMBDAS_STORAGE_LOCATION
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PROFILE_NAMES_CACHE_MAX, () =>
      parseInt(process.env.PROFILE_NAMES_CACHE_MAX ?? '20000')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PROFILE_NAMES_CACHE_TIMEOUT, () =>
      ms(process.env.PROFILE_NAMES_CACHE_TIMEOUT ?? '3h')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PROFILE_WEARABLES_CACHE_MAX, () =>
      parseInt(process.env.PROFILE_WEARABLES_CACHE_MAX ?? '1000')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PROFILE_WEARABLES_CACHE_TIMEOUT, () =>
      ms(process.env.PROFILE_WEARABLES_CACHE_TIMEOUT ?? '30m')
    )
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.METRICS, () => process.env.METRICS !== 'false')

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.MAX_SYNCHRONIZATION_TIME,
      () => process.env.MAX_SYNCHRONIZATION_TIME ?? DEFAULT_MAX_SYNCHRONIZATION_TIME
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.MAX_DEPLOYMENT_OBTENTION_TIME,
      () => process.env.MAX_DEPLOYMENT_OBTENTION_TIME ?? DEFAULT_MAX_DEPLOYMENT_OBTENTION_TIME
    )

    this.registerConfigIfNotAlreadySet(
      env,
      EnvironmentConfig.OFF_CHAIN_WEARABLES_REFRESH_TIME,
      () => process.env.OFF_CHAIN_WEARABLES_REFRESH_TIME ?? '1d'
    )

    // Please put special attention on the bean registration order.
    // Some beans depend on other beans, so the required beans should be registered before

    this.registerBeanIfNotAlreadySet(env, Bean.SMART_CONTENT_SERVER_FETCHER, () =>
      SmartContentServerFetcherFactory.create(env)
    )
    this.registerBeanIfNotAlreadySet(env, Bean.SMART_CONTENT_SERVER_CLIENT, () => SmartContentClientFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.THE_GRAPH_CLIENT, () => TheGraphClientFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.OFF_CHAIN_MANAGER, () => OffChainWearablesManagerFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.DAO, () => DAOCacheFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.ENS_OWNERSHIP, () => EnsOwnershipFactory.create(env))
    this.registerBeanIfNotAlreadySet(env, Bean.WEARABLES_OWNERSHIP, () => WearablesOwnershipFactory.create(env))

    return env
  }

  private registerConfigIfNotAlreadySet(env: Environment, key: EnvironmentConfig, valueProvider: () => any): void {
    env.setConfig(key, this.baseEnv.getConfig(key) ?? valueProvider())
  }

  private registerBeanIfNotAlreadySet(env: Environment, key: Bean, valueProvider: () => any): void {
    env.registerBean(key, this.baseEnv.getBean(key) ?? valueProvider())
  }
}
