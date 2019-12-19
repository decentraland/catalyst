import { ContentStorageFactory } from "./storage/ContentStorageFactory";
import { ServiceFactory } from "./service/ServiceFactory";
import { ControllerFactory } from "./controller/ControllerFactory";
import { HistoryManagerFactory } from "./service/history/HistoryManagerFactory";
import { NameKeeperFactory } from "./service/naming/NameKeeperFactory";
import { ContentStorage } from "./storage/ContentStorage";
import { Service } from "./service/Service";
import { HistoryManager } from "./service/history/HistoryManager";
import { NameKeeper } from "./service/naming/NameKeeper";
import { ContentAnalyticsFactory } from "./service/analytics/ContentAnalyticsFactory";
import { ContentAnalytics } from "./service/analytics/ContentAnalytics";
import { SynchronizationManager } from "../../content/src/service/synchronization/SynchronizationManager";
import { ClusterSynchronizationManagerFactory } from "./service/synchronization/ClusterSynchronizationManagerFactory";

export const STORAGE_ROOT_FOLDER = "STORAGE_ROOT_FOLDER";
export const SERVER_PORT = "SERVER_PORT"
export const LOG_REQUESTS = "LOG_REQUESTS"
export const DEBUG_NAME = "DEBUG_NAME"
export const SEGMENT_WRITE_KEY = "SEGMENT_WRITE_KEY"

const DEFAULT_STORAGE_ROOT_FOLDER = "storage"
const DEFAULT_SERVER_PORT = 6969

export class Environment {
    private configs: Map<string,any> = new Map();
    private beans: Map<Bean,any> = new Map();

    getConfig<T>(key:string): T {
        return this.configs.get(key);
    }

    setConfig<T>(key: string, value: T): Environment {
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
    NAME_KEEPER,
    ANALYTICS,
    SYNCHRONIZATION_MANAGER,
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

    withService(service: Service): EnvironmentBuilder {
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

    async build(): Promise<Environment> {
        const env = new Environment()

        this.setConfig(env, STORAGE_ROOT_FOLDER, () => process.env.STORAGE_ROOT_FOLDER ?? DEFAULT_STORAGE_ROOT_FOLDER)
        this.setConfig(env, SERVER_PORT        , () => process.env.SERVER_PORT         ?? DEFAULT_SERVER_PORT)
        this.setConfig(env, SEGMENT_WRITE_KEY  , () => process.env.SEGMENT_WRITE_KEY)
        this.setConfig(env, LOG_REQUESTS       , () => process.env.LOG_REQUESTS !== 'false')

        // TODO: Remove this before releasing, we don't want clients to choose their own name
        this.setConfig(env, DEBUG_NAME         , () => process.env.NAME)

        // Please put special attention on the bean registration order.
        // Some beans depend on other beans, so the required beans should be registered before

        this.registerBean(env, Bean.ANALYTICS                   , () => ContentAnalyticsFactory.create(env))
        const localStorage = await ContentStorageFactory.local(env)
        this.registerBean(env, Bean.STORAGE                     , () => localStorage)
        const nameKeeper = await NameKeeperFactory.create(env)
        this.registerBean(env, Bean.NAME_KEEPER                 , () => nameKeeper)
        const historyManager = await HistoryManagerFactory.create(env)
        this.registerBean(env, Bean.HISTORY_MANAGER             , () => historyManager)
        this.registerBean(env, Bean.SERVICE                     , () => ServiceFactory.create(env))
        this.registerBean(env, Bean.CONTROLLER                  , () => ControllerFactory.create(env))
        this.registerBean(env, Bean.SYNCHRONIZATION_MANAGER     , () => ClusterSynchronizationManagerFactory.create(env))

        return env
    }

    private setConfig(env: Environment, key: string, valueProvider: () => any): void {
        env.setConfig(key, this.baseEnv.getConfig(key) ?? valueProvider())
    }

    private registerBean(env: Environment, key: Bean, valueProvider: ()=>any): void {
        env.registerBean(key, this.baseEnv.getBean(key) ?? valueProvider())
    }
}