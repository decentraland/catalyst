import { ContentStorage } from "./ContentStorage";
import { FileSystemContentStorage } from "./FileSystemContentStorage";
import { Environment, EnvironmentConfig } from "../Environment";

export class ContentStorageFactory {
    static local(env: Environment): Promise<ContentStorage> {
        return FileSystemContentStorage.build(env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER));
    }
}

