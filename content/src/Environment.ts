import ms from "ms"
import log4js from "log4js"
import { ContentStorageFactory } from "./storage/ContentStorageFactory";
import { ServiceFactory } from "./service/ServiceFactory";
import { ControllerFactory } from "./controller/ControllerFactory";
import { HistoryManagerFactory } from "./service/history/HistoryManagerFactory";
import { NameKeeperFactory } from "./service/naming/NameKeeperFactory";
import { ContentStorage } from "./storage/ContentStorage";
import { MetaverseContentService } from "./service/Service";
import { HistoryManager } from "./service/history/HistoryManager";
import { DeploymentReporterFactory } from "./service/reporters/DeploymentReporterFactory";
import { DeploymentReporter } from "./service/reporters/DeploymentReporter";
import { SynchronizationManager } from "./service/synchronization/SynchronizationManager";
import { ClusterSynchronizationManagerFactory } from "./service/synchronization/ClusterSynchronizationManagerFactory";
import { PointerManagerFactory } from "./service/pointers/PointerManagerFactory";
import { AccessChecker } from "./service/access/AccessChecker";
import { ContentClusterFactory } from "./service/synchronization/ContentClusterFactory";
import { EventDeployerFactory } from "./service/synchronization/EventDeployerFactory";
import { DenylistFactory } from "./denylist/DenylistFactory";
import { DAOClientFactory } from "./service/synchronization/clients/DAOClientFactory";
import { EntityVersion } from "./service/Audit";
import { ContentAuthenticator } from "./service/auth/Authenticator";
import { AuthenticatorFactory } from "./service/auth/AuthenticatorFactory";
import { AccessCheckerImplFactory } from "./service/access/AccessCheckerImplFactory";
import { FetchHelperFactory } from "./helpers/FetchHelperFactory";
import { CacheManagerFactory } from "./service/caching/CacheManagerFactory";
import { ValidationsFactory } from "./service/validations/ValidationsFactory";
import { ChallengeSupervisor } from "./service/synchronization/ChallengeSupervisor";
import { RepositoryFactory } from "./storage/RepositoryFactory";
import { FailedDeploymentsManager } from "./service/errors/FailedDeploymentsManager";
import { DeploymentManagerFactory } from "./service/deployments/DeploymentManagerFactory";
import { MigrationManagerFactory } from "./MigrationManagerFactory";

export const CURRENT_CONTENT_VERSION: EntityVersion = EntityVersion.V3
const DEFAULT_STORAGE_ROOT_FOLDER = "storage"
const DEFAULT_SERVER_PORT = 6969
export const DEFAULT_ETH_NETWORK = "ropsten"
export const DEFAULT_DCL_PARCEL_ACCESS_URL_ROPSTEN = 'https://api.thegraph.com/subgraphs/name/nicosantangelo/watchtower-ropsten'
export const DEFAULT_DCL_PARCEL_ACCESS_URL_MAINNET = 'https://api.thegraph.com/subgraphs/name/nicosantangelo/watchtower'
export const CURRENT_COMMIT_HASH = process.env.COMMIT_HASH ?? "Unknown"
export const DEFAULT_DATABASE_CONFIG = {
    password: '12345678',
    user: 'postgres',
    database: 'content',
    host: 'localhost',
    schema: 'public',
    port: 5432,
}

export class Environment {
    private static readonly LOGGER = log4js.getLogger("Environment");
    private configs: Map<EnvironmentConfig, any>;
    private beans: Map<Bean,any>;

    constructor(otherEnv?: Environment) {
        this.configs = otherEnv ? new Map(otherEnv.configs) : new Map()
        this.beans = otherEnv ? new Map(otherEnv.beans): new Map()
    }

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

    logConfigValues() {
        Environment.LOGGER.info("These are the configuration values:")
        for (const [config, value] of this.configs.entries()) {
            Environment.LOGGER.info(`${EnvironmentConfig[config]}: ${JSON.stringify(value)}`)
        }
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
    DEPLOYMENT_REPORTER,
    SYNCHRONIZATION_MANAGER,
    DAO_CLIENT,
    ACCESS_CHECKER,
    DEPLOYMENT_MANAGER,
    CONTENT_CLUSTER,
    EVENT_DEPLOYER,
    DENYLIST,
    AUTHENTICATOR,
    FAILED_DEPLOYMENTS_MANAGER,
    FETCH_HELPER,
    CACHE_MANAGER,
    VALIDATIONS,
    CHALLENGE_SUPERVISOR,
    REPOSITORY,
    MIGRATION_MANAGER,
}

export enum EnvironmentConfig {
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
    ETH_NETWORK,
    LOG_LEVEL,
    JSON_REQUEST_TIMEOUT,
    FILE_DOWNLOAD_REQUEST_TIMEOUT,
    USE_COMPRESSION_MIDDLEWARE,
    PERFORM_MULTI_SERVER_ONBOARDING,
    CACHE_SIZES,
    REQUEST_TTL_BACKWARDS,
    DCL_PARCEL_ACCESS_URL,
    ALLOW_DEPLOYMENTS_FOR_TESTING,
    SQS_QUEUE_URL_REPORTING,
    SQS_ACCESS_KEY_ID,
    SQS_SECRET_ACCESS_KEY,
    PSQL_PASSWORD,
    PSQL_USER,
    PSQL_DATABASE,
    PSQL_HOST,
    PSQL_SCHEMA,
    PSQL_PORT,
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

    withDeploymentReporter(deploymentReporter: DeploymentReporter): EnvironmentBuilder {
        this.baseEnv.registerBean(Bean.DEPLOYMENT_REPORTER, deploymentReporter)
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
        const env = this.baseEnv

        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.STORAGE_ROOT_FOLDER            , () => process.env.STORAGE_ROOT_FOLDER ?? DEFAULT_STORAGE_ROOT_FOLDER)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SERVER_PORT                    , () => process.env.CONTENT_SERVER_PORT ?? DEFAULT_SERVER_PORT)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SEGMENT_WRITE_KEY              , () => process.env.SEGMENT_WRITE_KEY)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.METRICS                        , () => process.env.METRICS === 'true')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_REQUESTS                   , () => process.env.LOG_REQUESTS !== 'false')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.NAME_PREFIX                    , () => process.env.NAME_PREFIX ?? '')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL       , () => process.env.UPDATE_FROM_DAO_INTERVAL ?? ms('5m'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL     , () => process.env.SYNC_WITH_SERVERS_INTERVAL ?? ms('45s'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.IGNORE_VALIDATION_ERRORS       , () => false)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DECENTRALAND_ADDRESS           , () => ContentAuthenticator.DECENTRALAND_ADDRESS)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.ALLOW_LEGACY_ENTITIES          , () => process.env.ALLOW_LEGACY_ENTITIES === 'true')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.ETH_NETWORK                    , () => process.env.ETH_NETWORK ?? DEFAULT_ETH_NETWORK)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_LEVEL                      , () => process.env.LOG_LEVEL ?? "info")
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.JSON_REQUEST_TIMEOUT           , () => process.env.JSON_REQUEST_TIMEOUT ?? ms('1m'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.FILE_DOWNLOAD_REQUEST_TIMEOUT  , () => process.env.FILE_DOWNLOAD_REQUEST_TIMEOUT ?? ms('5m'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE     , () => process.env.USE_COMPRESSION_MIDDLEWARE === "true");
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PERFORM_MULTI_SERVER_ONBOARDING, () => process.env.PERFORM_MULTI_SERVER_ONBOARDING !== "false");
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.CACHE_SIZES                    , () => new Map(Object.entries(process.env).filter(([name,]) => name.startsWith("CACHE"))));
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.REQUEST_TTL_BACKWARDS          , () => ms('20m'));
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.DCL_PARCEL_ACCESS_URL          , () => process.env.DCL_PARCEL_ACCESS_URL ?? (env.getConfig(EnvironmentConfig.ETH_NETWORK) === 'mainnet' ? DEFAULT_DCL_PARCEL_ACCESS_URL_MAINNET : DEFAULT_DCL_PARCEL_ACCESS_URL_ROPSTEN))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.ALLOW_DEPLOYMENTS_FOR_TESTING  , () => process.env.ALLOW_DEPLOYMENTS_FOR_TESTING === "true")
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SQS_QUEUE_URL_REPORTING        , () => process.env.SQS_QUEUE_URL_REPORTING)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SQS_ACCESS_KEY_ID              , () => process.env.SQS_ACCESS_KEY_ID)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SQS_SECRET_ACCESS_KEY          , () => process.env.SQS_SECRET_ACCESS_KEY)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PSQL_PASSWORD                  , () => process.env.POSTGRES_PASSWORD ?? DEFAULT_DATABASE_CONFIG.password)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PSQL_USER                      , () => process.env.POSTGRES_USER ?? DEFAULT_DATABASE_CONFIG.user)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PSQL_DATABASE                  , () => process.env.POSTGRES_DB ?? DEFAULT_DATABASE_CONFIG.database)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PSQL_HOST                      , () => process.env.POSTGRES_HOST ?? DEFAULT_DATABASE_CONFIG.host)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PSQL_SCHEMA                    , () => process.env.POSTGRES_SCHEMA ?? DEFAULT_DATABASE_CONFIG.schema)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.PSQL_PORT                      , () => process.env.POSTGRES_PORT ?? DEFAULT_DATABASE_CONFIG.port)

        // Please put special attention on the bean registration order.
        // Some beans depend on other beans, so the required beans should be registered before

        const repository = await RepositoryFactory.create(env)
        this.registerBeanIfNotAlreadySet(env, Bean.REPOSITORY                  , () => repository)
        this.registerBeanIfNotAlreadySet(env, Bean.CHALLENGE_SUPERVISOR        , () => new ChallengeSupervisor())
        this.registerBeanIfNotAlreadySet(env, Bean.CACHE_MANAGER               , () => CacheManagerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.FETCH_HELPER                , () => FetchHelperFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.DAO_CLIENT                  , () => DAOClientFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.AUTHENTICATOR               , () => AuthenticatorFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.DEPLOYMENT_REPORTER         , () => DeploymentReporterFactory.create(env))
        const localStorage = await ContentStorageFactory.local(env)
        this.registerBeanIfNotAlreadySet(env, Bean.STORAGE                     , () => localStorage)
        const nameKeeper = await NameKeeperFactory.create(env)
        this.registerBeanIfNotAlreadySet(env, Bean.NAME_KEEPER                 , () => nameKeeper)
        this.registerBeanIfNotAlreadySet(env, Bean.CONTENT_CLUSTER             , () => ContentClusterFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.HISTORY_MANAGER             , () => HistoryManagerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.DEPLOYMENT_MANAGER          , () => DeploymentManagerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.DENYLIST                    , () => DenylistFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.POINTER_MANAGER             , () => PointerManagerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.ACCESS_CHECKER              , () => AccessCheckerImplFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.FAILED_DEPLOYMENTS_MANAGER  , () => new FailedDeploymentsManager())
        this.registerBeanIfNotAlreadySet(env, Bean.VALIDATIONS                 , () => ValidationsFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.SERVICE                     , () => ServiceFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.EVENT_DEPLOYER              , () => EventDeployerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.SYNCHRONIZATION_MANAGER     , () => ClusterSynchronizationManagerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.CONTROLLER                  , () => ControllerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.MIGRATION_MANAGER           , () => MigrationManagerFactory.create(env))

        return env
    }

    private registerConfigIfNotAlreadySet(env: Environment, key: EnvironmentConfig, valueProvider: () => any): void {
        env.setConfig(key, env.getConfig(key) ?? valueProvider())
    }

    private registerBeanIfNotAlreadySet(env: Environment, key: Bean, valueProvider: ()=>any): void {
        env.registerBean(key, env.getBean(key) ?? valueProvider())
    }
}