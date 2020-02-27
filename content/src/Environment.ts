import ms from "ms"
import { ContentStorageFactory } from "./storage/ContentStorageFactory";
import { ServiceFactory } from "./service/ServiceFactory";
import { ControllerFactory } from "./controller/ControllerFactory";
import { HistoryManagerFactory } from "./service/history/HistoryManagerFactory";
import { NameKeeperFactory } from "./service/naming/NameKeeperFactory";
import { ContentStorage } from "./storage/ContentStorage";
import { MetaverseContentService } from "./service/Service";
import { HistoryManager } from "./service/history/HistoryManager";
import { NameKeeper } from "./service/naming/NameKeeper";
import { ContentAnalyticsFactory } from "./service/analytics/ContentAnalyticsFactory";
import { ContentAnalytics } from "./service/analytics/ContentAnalytics";
import { SynchronizationManager } from "./service/synchronization/SynchronizationManager";
import { ClusterSynchronizationManagerFactory } from "./service/synchronization/ClusterSynchronizationManagerFactory";
import { PointerManagerFactory } from "./service/pointers/PointerManagerFactory";
import { AccessChecker } from "./service/access/AccessChecker";
import { AuditFactory } from "./service/audit/AuditFactory";
import { ContentClusterFactory } from "./service/synchronization/ContentClusterFactory";
import { EventDeployerFactory } from "./service/synchronization/EventDeployerFactory";
import { DenylistFactory } from "./denylist/DenylistFactory";
import { DAOClientFactory } from "./service/synchronization/clients/DAOClientFactory";
import { EntityVersion } from "./service/audit/Audit";
import { ContentAuthenticator } from "./service/auth/Authenticator";
import { AuthenticatorFactory } from "./service/auth/AuthenticatorFactory";
import { AccessCheckerImplFactory } from "./service/access/AccessCheckerImplFactory";
import { FailedDeploymentsManagerFactory } from "./service/errors/FailedDeploymentsManagerFactory";
import { FetchHelperFactory } from "./helpers/FetchHelperFactory";
import { ValidationsFactory } from "./service/validations/ValidationsFactory";

export const CURRENT_CONTENT_VERSION: EntityVersion = EntityVersion.V3
const DEFAULT_STORAGE_ROOT_FOLDER = "storage"
const DEFAULT_SERVER_PORT = 6969
const DEFAULT_DCL_API_URL = "https://api.decentraland.zone/v1"
export const DEFAULT_ETH_NETWORK = "ropsten"

export const CURRENT_COMMIT_HASH = process.env.COMMIT_HASH ?? "Unknown"
export const ETH_NETWORK = process.env.ETH_NETWORK ?? "Unknown"

export class Environment {
    private configs: Map<EnvironmentConfig, any> = new Map();
    private beans: Map<Bean,any> = new Map();

    getConfig<T>(key: EnvironmentConfig): T {
        return this.configs.get(key);
    }

    setConfig<T>(key: EnvironmentConfig, value: T): Environment {
        this.configs.set(key, value);
        return this
    }

    getBean<T>(type:Bean): T {
        return this.beans.get(type);
    }

    registerBean<T>(type: Bean, bean: T): Environment {
        this.beans.set(type, bean);
        return this
    }

    private static instance: Environment;
    static async getInstance(): Promise<Environment> {
        if(!Environment.instance) {
            // Create default instance
            Environment.instance = await new EnvironmentBuilder().build()
        }
        return Environment.instance;
    }
}

export const enum Bean {
    STORAGE,
    SERVICE,
    CONTROLLER,
    HISTORY_MANAGER,
    POINTER_MANAGER,
    NAME_KEEPER,
    ANALYTICS,
    SYNCHRONIZATION_MANAGER,
    DAO_CLIENT,
    ACCESS_CHECKER,
    AUDIT,
    CONTENT_CLUSTER,
    EVENT_DEPLOYER,
    DENYLIST,
    AUTHENTICATOR,
    FAILED_DEPLOYMENTS_MANAGER,
    FETCH_HELPER,
    VALIDATIONS,
}

export const enum EnvironmentConfig {
    STORAGE_ROOT_FOLDER,
    SERVER_PORT,
    METRICS,
    LOG_REQUESTS,
    NAME_PREFIX,
    SEGMENT_WRITE_KEY,
    UPDATE_FROM_DAO_INTERVAL,
    SYNC_WITH_SERVERS_INTERVAL,
    IGNORE_VALIDATION_ERRORS,
    ALLOW_LEGACY_ENTITIES,
    DECENTRALAND_ADDRESS,
    DCL_API_URL,
    ETH_NETWORK,
    LOG_LEVEL,
    JSON_REQUEST_TIMEOUT,
    FILE_DOWNLOAD_REQUEST_TIMEOUT,
    USE_COMPRESSION_MIDDLEWARE,
    PERFORM_MULTI_SERVER_ONBOARDING,
    REQUEST_TTL_BACKWARDS,
}

export class EnvironmentBuilder {
    private baseEnv: Environment
    constructor(baseEnv?:Environment) {
        this.baseEnv = baseEnv ?? new Environment()
    }

    withStorage(storage: ContentStorage): EnvironmentBuilder {
        this.baseEnv.registerBean(Bean.STORAGE, storage)
        return this
    }

    withService(service: MetaverseContentService): EnvironmentBuilder {
        this.baseEnv.registerBean(Bean.SERVICE, service)
        return this
    }

    withHistoryManager(historyManager: HistoryManager): EnvironmentBuilder {
        this.baseEnv.registerBean(Bean.HISTORY_MANAGER, historyManager)
        return this
    }

    withNameKeeper(nameKeeper: NameKeeper): EnvironmentBuilder {
        this.baseEnv.registerBean(Bean.NAME_KEEPER, nameKeeper)
        return this
    }

    withAnalytics(contentAnalytics: ContentAnalytics): EnvironmentBuilder {
        this.baseEnv.registerBean(Bean.ANALYTICS, contentAnalytics)
        return this
    }

    withSynchronizationManager(synchronizationManager: SynchronizationManager): EnvironmentBuilder {
        this.baseEnv.registerBean(Bean.SYNCHRONIZATION_MANAGER, synchronizationManager)
        return this
    }

    withAccessChecker(accessChecker: AccessChecker): EnvironmentBuilder {
        this.baseEnv.registerBean(Bean.ACCESS_CHECKER, accessChecker)
        return this
    }

    withBean(bean: Bean, value: any): EnvironmentBuilder {
        this.baseEnv.registerBean(bean, value)
        return this
    }

    withConfig(config: EnvironmentConfig, value: any): EnvironmentBuilder {
        this.baseEnv.setConfig(config, value)
        return this
    }

    async build(): Promise<Environment> {
        const env = new Environment()

        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.STORAGE_ROOT_FOLDER       , () => process.env.STORAGE_ROOT_FOLDER ?? DEFAULT_STORAGE_ROOT_FOLDER)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SERVER_PORT               , () => process.env.CONTENT_SERVER_PORT ?? DEFAULT_SERVER_PORT)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SEGMENT_WRITE_KEY         , () => process.env.SEGMENT_WRITE_KEY)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.METRICS                   , () => process.env.METRICS === 'true')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_REQUESTS              , () => process.env.LOG_REQUESTS === 'true')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.NAME_PREFIX               , () => process.env.NAME_PREFIX ?? '')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL  , () => process.env.UPDATE_FROM_DAO_INTERVAL ?? ms('5m'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL, () => process.env.SYNC_WITH_SERVERS_INTERVAL ?? ms('45s'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.IGNORE_VALIDATION_ERRORS  , () => false)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DECENTRALAND_ADDRESS      , () => ContentAuthenticator.DECENTRALAND_ADDRESS)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.ALLOW_LEGACY_ENTITIES     , () => process.env.ALLOW_LEGACY_ENTITIES === 'true')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DCL_API_URL               , () => process.env.DCL_API_URL ?? DEFAULT_DCL_API_URL)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.ETH_NETWORK               , () => process.env.ETH_NETWORK ?? DEFAULT_ETH_NETWORK)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_LEVEL                 , () => process.env.LOG_LEVEL ?? "info")
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.JSON_REQUEST_TIMEOUT      , () => process.env.JSON_REQUEST_TIMEOUT ?? ms('1m'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.FILE_DOWNLOAD_REQUEST_TIMEOUT, () => process.env.FILE_DOWNLOAD_REQUEST_TIMEOUT ?? ms('5m'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE, () => process.env.USE_COMPRESSION_MIDDLEWARE === "true");
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PERFORM_MULTI_SERVER_ONBOARDING, () => process.env.PERFORM_MULTI_SERVER_ONBOARDING === "true");
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.REQUEST_TTL_BACKWARDS     , () => ms('20m'));

        // Please put special attention on the bean registration order.
        // Some beans depend on other beans, so the required beans should be registered before

        this.registerBeanIfNotAlreadySet(env, Bean.FETCH_HELPER              , () => FetchHelperFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.DAO_CLIENT                  , () => DAOClientFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.AUTHENTICATOR               , () => AuthenticatorFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.ANALYTICS                   , () => ContentAnalyticsFactory.create(env))
        const localStorage = await ContentStorageFactory.local(env)
        this.registerBeanIfNotAlreadySet(env, Bean.STORAGE                     , () => localStorage)
        const nameKeeper = await NameKeeperFactory.create(env)
        this.registerBeanIfNotAlreadySet(env, Bean.NAME_KEEPER                 , () => nameKeeper)
        this.registerBeanIfNotAlreadySet(env, Bean.CONTENT_CLUSTER             , () => ContentClusterFactory.create(env))
        const historyManager = await HistoryManagerFactory.create(env)
        this.registerBeanIfNotAlreadySet(env, Bean.HISTORY_MANAGER             , () => historyManager)
        this.registerBeanIfNotAlreadySet(env, Bean.AUDIT                       , () => AuditFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.DENYLIST                    , () => DenylistFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.POINTER_MANAGER             , () => PointerManagerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.ACCESS_CHECKER              , () => AccessCheckerImplFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.FAILED_DEPLOYMENTS_MANAGER  , () => FailedDeploymentsManagerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.VALIDATIONS                 , () => ValidationsFactory.create(env))
        const service = await ServiceFactory.create(env);
        this.registerBeanIfNotAlreadySet(env, Bean.SERVICE                     , () => service)
        this.registerBeanIfNotAlreadySet(env, Bean.EVENT_DEPLOYER              , () => EventDeployerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.SYNCHRONIZATION_MANAGER     , () => ClusterSynchronizationManagerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.CONTROLLER                  , () => ControllerFactory.create(env))

        return env
    }

    private registerConfigIfNotAlreadySet(env: Environment, key: EnvironmentConfig, valueProvider: () => any): void {
        env.setConfig(key, this.baseEnv.getConfig(key) ?? valueProvider())
    }

    private registerBeanIfNotAlreadySet(env: Environment, key: Bean, valueProvider: ()=>any): void {
        env.registerBean(key, this.baseEnv.getBean(key) ?? valueProvider())
    }
}