import { ContentStorageFactory } from "./storage/ContentStorageFactory";
import { ServiceFactory } from "./service/ServiceFactory";
import { ControllerFactory } from "./controller/ControllerFactory";
import { HistoryManagerFactory } from "./service/history/HistoryManagerFactory";
import { NameKeeperFactory } from "./service/naming/NameKeeperFactory";
import { ContentStorage } from "./storage/ContentStorage";
import { Service } from "./service/Service";
import { HistoryManager } from "./service/history/HistoryManager";
import { NameKeeper } from "./service/naming/NameKeeper";

export const STORAGE_ROOT_FOLDER = "STORAGE_ROOT_FOLDER";
export const SERVER_PORT = "SERVER_PORT"

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
    NAMING,
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
        this.baseEnv.registerBean(Bean.NAMING, nameKeeper)
        return this
    }

    async build(): Promise<Environment> {
        const env = new Environment()

        this.setConfig(env, STORAGE_ROOT_FOLDER, () => process.env.STORAGE_ROOT_FOLDER ?? DEFAULT_STORAGE_ROOT_FOLDER)
        this.setConfig(env, SERVER_PORT        , () => process.env.SERVER_PORT         ?? DEFAULT_SERVER_PORT)

        this.registerBean(env, Bean.STORAGE        , () => ContentStorageFactory.local(env))
        const naming = await NameKeeperFactory.create(env)
        this.registerBean(env, Bean.NAMING         , () => naming)
        const historyManager = await HistoryManagerFactory.create(env)
        this.registerBean(env, Bean.HISTORY_MANAGER, () => historyManager)
        this.registerBean(env, Bean.SERVICE        , () => ServiceFactory.create(env))
        this.registerBean(env, Bean.CONTROLLER     , () => ControllerFactory.create(env))

        return env
    }

    private setConfig(env: Environment, key: string, valueProvider: () => any): void {
        env.setConfig(key, this.baseEnv.getConfig(key) ?? valueProvider())
    }

    private registerBean(env: Environment, key: Bean, valueProvider: ()=>any): void {
        env.registerBean(key, this.baseEnv.getBean(key) ?? valueProvider())
    }
}