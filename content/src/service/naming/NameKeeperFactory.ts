import { Environment, EnvironmentConfig } from "../../Environment"
import { NamingStorage } from "./NamingStorage"
import { NameKeeper } from "./NameKeeper"
import { NamingContentStorage } from "./NamingContentStorage";

export class NameKeeperFactory {

    static async create(env: Environment): Promise<NameKeeper> {
        const contentStorage = await NamingContentStorage.build(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER))
        const storage: NamingStorage = new NamingStorage(contentStorage)
        return NameKeeper.build(storage, env.getConfig(EnvironmentConfig.NAME_PREFIX))
    }
}
