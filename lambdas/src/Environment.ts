import { ServiceFactory } from "./service/ServiceFactory";
import { ControllerFactory } from "./controller/ControllerFactory";
import { SmartContentServerFetcherFactory } from "./SmartContentServerFetcherFactory";
import { DAOCacheFactory } from "./apis/contracts/DAOCacheFactory";

const DEFAULT_SERVER_PORT = 7070;
export const DEFAULT_ETH_NETWORK = "ropsten"
export const DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN = "https://api.thegraph.com/subgraphs/name/decentraland/marketplace-ropsten";
const DEFAULT_ENS_OWNER_PROVIDER_URL_MAINNET = "https://api.thegraph.com/subgraphs/name/decentraland/marketplace";

const DEFAULT_LAMBDAS_STORAGE_LOCATION = 'lambdas-storage'

export class Environment {
  private configs: Map<EnvironmentConfig, any> = new Map();
  private beans: Map<Bean, any> = new Map();

  getConfig<T>(key: EnvironmentConfig): T {
    return this.configs.get(key);
  }

  setConfig<T>(key: EnvironmentConfig, value: T): Environment {
    this.configs.set(key, value);
    return this;
  }

  getBean<T>(type: Bean): T {
    return this.beans.get(type);
  }

  registerBean<T>(type: Bean, bean: T): Environment {
    this.beans.set(type, bean);
    return this;
  }

  private static instance: Environment;
  static async getInstance(): Promise<Environment> {
    if (!Environment.instance) {
      // Create default instance
      Environment.instance = await new EnvironmentBuilder().build();
    }
    return Environment.instance;
  }
}

export const enum Bean {
  SERVICE,
  CONTROLLER,
  SMART_CONTENT_SERVER_FETCHER,
  DAO
}

export const enum EnvironmentConfig {
  SERVER_PORT,
  LOG_REQUESTS,
  CONTENT_SERVER_ADDRESS,
  ENS_OWNER_PROVIDER_URL,
  COMMIT_HASH,
  USE_COMPRESSION_MIDDLEWARE,
  LOG_LEVEL,
  ETH_NETWORK,
  LAMBDAS_STORAGE_LOCATION
}

export class EnvironmentBuilder {
  private baseEnv: Environment;
  constructor(baseEnv?: Environment) {
    this.baseEnv = baseEnv ?? new Environment();
  }

  withConfig(config: EnvironmentConfig, value: any): EnvironmentBuilder {
    this.baseEnv.setConfig(config, value);
    return this;
  }

  withBean(bean: Bean, value: any): EnvironmentBuilder {
    this.baseEnv.registerBean(bean, value);
    return this;
  }

  async build(): Promise<Environment> {
    const env = new Environment();

    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SERVER_PORT, () => process.env.SERVER_PORT ?? DEFAULT_SERVER_PORT);
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_REQUESTS, () => process.env.LOG_REQUESTS !== "false");
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.CONTENT_SERVER_ADDRESS, () => process.env.CONTENT_SERVER_ADDRESS);
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.ENS_OWNER_PROVIDER_URL, () => process.env.ENS_OWNER_PROVIDER_URL ?? (process.env.ETH_NETWORK === 'mainnet' ? DEFAULT_ENS_OWNER_PROVIDER_URL_MAINNET : DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN))
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.COMMIT_HASH, () => process.env.COMMIT_HASH ?? "Unknown");
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE, () => process.env.USE_COMPRESSION_MIDDLEWARE === "true");
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_LEVEL, () => process.env.LOG_LEVEL ?? "info");
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.ETH_NETWORK, () => process.env.ETH_NETWORK ?? DEFAULT_ETH_NETWORK);
    this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LAMBDAS_STORAGE_LOCATION, () => process.env.LAMBDAS_STORAGE_LOCATION ?? DEFAULT_LAMBDAS_STORAGE_LOCATION);

    // Please put special attention on the bean registration order.
    // Some beans depend on other beans, so the required beans should be registered before

    this.registerBeanIfNotAlreadySet(env, Bean.SMART_CONTENT_SERVER_FETCHER, () => SmartContentServerFetcherFactory.create(env));
    this.registerBeanIfNotAlreadySet(env, Bean.DAO, () => DAOCacheFactory.create(env));
    this.registerBeanIfNotAlreadySet(env, Bean.SERVICE, () => ServiceFactory.create(env));
    this.registerBeanIfNotAlreadySet(env, Bean.CONTROLLER, () => ControllerFactory.create(env));

    return env;
  }

  private registerConfigIfNotAlreadySet(env: Environment, key: EnvironmentConfig, valueProvider: () => any): void {
    env.setConfig(key, this.baseEnv.getConfig(key) ?? valueProvider());
  }

  private registerBeanIfNotAlreadySet(env: Environment, key: Bean, valueProvider: () => any): void {
    env.registerBean(key, this.baseEnv.getBean(key) ?? valueProvider());
  }
}
