import { ContentStorage } from "./ContentStorage";
import fs from 'fs';

export class FileSystemContentStorage implements ContentStorage {

    private constructor(private root: string) { }

    static async build(root: string): Promise<FileSystemContentStorage> {
        while (root.endsWith('/')) {
            root = root.slice(0,-1)
        }
        await this.ensureDirectoryExists(root)
        return new FileSystemContentStorage(root)
    }

    async store(category: string, id: string, content: Buffer, append?: boolean): Promise<void> {
        let categoryDir = this.getDirPath(category);
        await FileSystemContentStorage.ensureDirectoryExists(categoryDir)
        if (append) {
            return await fs.promises.appendFile(this.getFilePath(category, id), content);
        }
        return fs.promises.writeFile(this.getFilePath(category, id), content)
    }

    async delete(category: string, id: string): Promise<void> {
        // TODO: Catch potential exception if file doesn't exist, and return better error message
        await fs.promises.unlink(this.getFilePath(category, id))
    }

    async getContent(category: string, id: string): Promise<Buffer | undefined> {
        try {
            return await fs.promises.readFile(this.getFilePath(category, id))
        } catch (error) {
            return Promise.resolve(undefined)
        }
    }

    listIds(category: string): Promise<string[]> {
        return fs.promises.readdir(this.getDirPath(category))
    }

    async exists(category: string, id: string): Promise<boolean> {
        return FileSystemContentStorage.existPath(this.getFilePath(category, id))
    }

    private getDirPath(category: string): string {
        return this.root + '/' + category
    }
    private getFilePath(category: string, id: string): string {
        return this.getDirPath(category) + '/' + id
    }

    private static async ensureDirectoryExists(directory: string): Promise<void> {
        const alreadyExist = await FileSystemContentStorage.existPath(directory)
        if (!alreadyExist) {
            try {
                await fs.promises.mkdir(directory);
            } catch (error) {
                // Ignore these errors
            }
        }
        return Promise.resolve();
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
