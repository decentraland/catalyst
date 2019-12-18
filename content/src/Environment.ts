import { ContentStorageFactory } from "./storage/ContentStorageFactory";
import { ServiceFactory } from "./service/ServiceFactory";
import { ControllerFactory } from "./controller/ControllerFactory";
import { HistoryManagerFactory } from "./service/history/HistoryManagerFactory";
import { NamingFactory } from "./service/naming/NamingFactory";

export const STORAGE_ROOT_FOLDER = "STORAGE_ROOT_FOLDER";
export const SERVER_PORT = "SERVER_PORT"

export class Environment {
    private configs: Map<string,any> = new Map();
    private beans: Map<Bean,any> = new Map();

    getConfig<T>(key:string): T {
        return this.configs.get(key);
    }

    setConfig<T>(key: string, value: T): void {
        this.configs.set(key, value);
    }

    getBean<T>(type:Bean): T {
        return this.beans.get(type);
    }

    registerBean<T>(type: Bean, bean: T): void {
        this.beans.set(type, bean);
    }

    private static instance: Environment;
    static async getInstance(): Promise<Environment> {
        if(!Environment.instance) {
            // Create default instance
            const env = new Environment()
            Environment.instance = env

            env.setConfig(STORAGE_ROOT_FOLDER, process.env.STORAGE_ROOT_FOLDER ?? "storage")
            env.setConfig(SERVER_PORT, process.env.SERVER_PORT ?? 6969)

            env.registerBean(Bean.STORAGE, ContentStorageFactory.local(env))
            env.registerBean(Bean.NAMING, await NamingFactory.create(env))
            env.registerBean(Bean.HISTORY_MANAGER, await HistoryManagerFactory.create(env))
            env.registerBean(Bean.SERVICE, ServiceFactory.create(env))
            env.registerBean(Bean.CONTROLLER, ControllerFactory.create(env))
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
