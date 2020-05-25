import path from 'path';
import fs from 'fs';
import { ContentStorage, ContentItem, SimpleContentItem } from "./ContentStorage";

export class FileSystemContentStorage implements ContentStorage {

    private constructor(private root: string) { }

    static async build(root: string): Promise<FileSystemContentStorage> {
        while (root.endsWith('/')) {
            root = root.slice(0, -1)
        }
        await this.ensureDirectoryExists(root)
        return new FileSystemContentStorage(root)
    }

    store(id: string, content: Buffer): Promise<void> {
        return fs.promises.writeFile(this.getFilePath(id), content)
    }

    async delete(id: string): Promise<void> {
        // TODO: Catch potential exception if file doesn't exist, and return better error message
        await fs.promises.unlink(this.getFilePath(id))
    }

    async retrieve(id: string): Promise<ContentItem | undefined> {
        try {
            const filePath = this.getFilePath(id)
            if (await FileSystemContentStorage.existPath(filePath)) {
                const stat = await fs.promises.stat(filePath)

                return SimpleContentItem.fromStream(fs.createReadStream(filePath), stat.size)
            }
        } catch (error) { }
        return undefined
    }

    async exist(ids: string[]): Promise<Map<string, boolean>> {
        const checks = await Promise.all(ids.map<Promise<[string, boolean]>>(async id => [id, await FileSystemContentStorage.existPath(this.getFilePath(id))]))
        return new Map(checks)
    }

    private getFilePath(id: string): string {
        return path.join(this.root, id)
    }

    private static async ensureDirectoryExists(directory: string): Promise<void> {
        const alreadyExist = await FileSystemContentStorage.existPath(directory)
        if (!alreadyExist) {
            try {
                await fs.promises.mkdir(directory, { recursive: true });
            } catch (error) {
                // Ignore these errors
            }
        }
    }

    private static async existPath(path: string): Promise<boolean> {
        try {
            await fs.promises.access(path, fs.constants.F_OK | fs.constants.W_OK)
            return true
        } catch (error) {
            return false
        }
    }

}

