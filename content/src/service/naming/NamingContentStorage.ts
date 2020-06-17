import fs from 'fs';
import { SimpleContentItem, ContentItem } from '@katalyst/content/storage/ContentStorage';
import { ensureDirectoryExists, existPath } from 'decentraland-katalyst-commons/fsutils';

export class NamingContentStorage {

    private constructor(private root: string) { }

    static async build(root: string): Promise<NamingContentStorage> {
        while (root.endsWith('/')) {
            root = root.slice(0, -1)
        }
        await ensureDirectoryExists(root)
        return new NamingContentStorage(root)
    }

    async store(category: string, id: string, content: Buffer): Promise<void> {
        let categoryDir = this.getDirPath(category);
        await ensureDirectoryExists(categoryDir)
        return fs.promises.writeFile(this.getFilePath(category, id), content)
    }

    async getContent(category: string, id: string): Promise<ContentItem | undefined> {
        try {
            const filePath = this.getFilePath(category, id)
            if (await existPath(filePath)) {
                const stat = await fs.promises.stat(filePath)

                return SimpleContentItem.fromStream(fs.createReadStream(filePath), stat.size)
            }
        } catch (error) { }
        return undefined
    }

    private getDirPath(category: string): string {
        return this.root + '/' + category
    }
    private getFilePath(category: string, id: string): string {
        return this.getDirPath(category) + '/' + id
    }

}

