import ms from "ms"
import { ContentStorageFactory } from "./storage/ContentStorageFactory";
import { ServiceFactory } from "./service/ServiceFactory";
import { ControllerFactory } from "./controller/ControllerFactory";
import { HistoryManagerFactory } from "./service/history/HistoryManagerFactory";
import { NameKeeperFactory } from "./service/naming/NameKeeperFactory";
import { ContentStorage } from "./storage/ContentStorage";
import { MetaverseContentService, TimeKeepingService, ClusterDeploymentsService } from "./service/Service";
import { HistoryManager } from "./service/history/HistoryManager";
import { NameKeeper } from "./service/naming/NameKeeper";
import { ContentAnalyticsFactory } from "./service/analytics/ContentAnalyticsFactory";
import { ContentAnalytics } from "./service/analytics/ContentAnalytics";
import { SynchronizationManager } from "../../content/src/service/synchronization/SynchronizationManager";
import { ClusterSynchronizationManagerFactory } from "./service/synchronization/ClusterSynchronizationManagerFactory";
import { PointerManagerFactory } from "./service/pointers/PointerManagerFactory";
import { AccessChecker } from "./service/access/AccessChecker";
import { AccessCheckerImpl } from "./service/access/AccessCheckerImpl";
import { AuditFactory } from "./service/audit/AuditFactory";
import { ContentClusterFactory } from "./service/synchronization/ContentClusterFactory";
import { EventDeployerFactory } from "./service/synchronization/EventDeployerFactory";
import { DAOClient } from "./service/synchronization/clients/DAOClient";

const DEFAULT_STORAGE_ROOT_FOLDER = "storage"
const DEFAULT_SERVER_PORT = 6969

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
}

export const enum EnvironmentConfig {
    STORAGE_ROOT_FOLDER,
    SERVER_PORT,
    LOG_REQUESTS,
    NAME_PREFIX,
    SEGMENT_WRITE_KEY,
    UPDATE_FROM_DAO_INTERVAL,
    SYNC_WITH_SERVERS_INTERVAL,
    IGNORE_VALIDATION_ERRORS,
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

    withService(service: MetaverseContentService & TimeKeepingService & ClusterDeploymentsService): EnvironmentBuilder {
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
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SERVER_PORT               , () => process.env.SERVER_PORT         ?? DEFAULT_SERVER_PORT)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SEGMENT_WRITE_KEY         , () => process.env.SEGMENT_WRITE_KEY)
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.LOG_REQUESTS              , () => process.env.LOG_REQUESTS !== 'false')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.NAME_PREFIX               , () => process.env.NAME_PREFIX ?? '')
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.UPDATE_FROM_DAO_INTERVAL  , () => process.env.UPDATE_FROM_DAO_INTERVAL ?? ms('5m'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.SYNC_WITH_SERVERS_INTERVAL, () => process.env.SYNC_WITH_SERVERS_INTERVAL ?? ms('20s'))
        this.registerConfigIfNotAlreadySet(env, EnvironmentConfig.IGNORE_VALIDATION_ERRORS  , () => false)

        // Please put special attention on the bean registration order.
        // Some beans depend on other beans, so the required beans should be registered before

        this.registerBeanIfNotAlreadySet(env, Bean.DAO_CLIENT                  , () => new DAOClient())
        this.registerBeanIfNotAlreadySet(env, Bean.ANALYTICS                   , () => ContentAnalyticsFactory.create(env))
        const localStorage = await ContentStorageFactory.local(env)
        this.registerBeanIfNotAlreadySet(env, Bean.STORAGE                     , () => localStorage)
        const nameKeeper = await NameKeeperFactory.create(env)
        this.registerBeanIfNotAlreadySet(env, Bean.NAME_KEEPER                 , () => nameKeeper)
        this.registerBeanIfNotAlreadySet(env, Bean.CONTENT_CLUSTER             , () => ContentClusterFactory.create(env))
        const historyManager = await HistoryManagerFactory.create(env)
        this.registerBeanIfNotAlreadySet(env, Bean.HISTORY_MANAGER             , () => historyManager)
        this.registerBeanIfNotAlreadySet(env, Bean.AUDIT                       , () => AuditFactory.create(env))
        const pointerManager = await PointerManagerFactory.create(env);
        this.registerBeanIfNotAlreadySet(env, Bean.POINTER_MANAGER             , () => pointerManager)
        this.registerBeanIfNotAlreadySet(env, Bean.ACCESS_CHECKER              , () => new AccessCheckerImpl())
        const service = await ServiceFactory.create(env);
        this.registerBeanIfNotAlreadySet(env, Bean.SERVICE                     , () => service)
        this.registerBeanIfNotAlreadySet(env, Bean.EVENT_DEPLOYER              , () => EventDeployerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.CONTROLLER                  , () => ControllerFactory.create(env))
        this.registerBeanIfNotAlreadySet(env, Bean.SYNCHRONIZATION_MANAGER     , () => ClusterSynchronizationManagerFactory.create(env))

        return env
    }

    private registerConfigIfNotAlreadySet(env: Environment, key: EnvironmentConfig, valueProvider: () => any): void {
        env.setConfig(key, this.baseEnv.getConfig(key) ?? valueProvider())
    }

    private registerBeanIfNotAlreadySet(env: Environment, key: Bean, valueProvider: ()=>any): void {
        env.registerBean(key, this.baseEnv.getBean(key) ?? valueProvider())
    }
}