import { ContentStorage } from "./ContentStorage";
import { FileSystemContentStorage } from "./FileSystemContentStorage";

export class ContentStorageFactory {
    static local(rootFolder: string): ContentStorage {
        return new FileSystemContentStorage(rootFolder);
    }
}

