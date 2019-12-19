import { ContentStorage } from "./ContentStorage";
import { FileSystemContentStorage } from "./FileSystemContentStorage";
import { Environment, STORAGE_ROOT_FOLDER } from "../Environment";

export class ContentStorageFactory {
    static local(env: Environment): Promise<ContentStorage> {
        return FileSystemContentStorage.build(env.getConfig(STORAGE_ROOT_FOLDER));
    }
}

