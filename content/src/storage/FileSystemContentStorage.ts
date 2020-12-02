import path from 'path'
import fs from 'fs'
import { ContentStorage, ContentItem, SimpleContentItem, StorageContent } from './ContentStorage'
import { ensureDirectoryExists, existPath } from 'decentraland-katalyst-commons/fsutils'

export class FileSystemContentStorage implements ContentStorage {
  private constructor(private root: string) {}

  static async build(root: string): Promise<FileSystemContentStorage> {
    while (root.endsWith('/')) {
      root = root.slice(0, -1)
    }
    await ensureDirectoryExists(root)
    return new FileSystemContentStorage(root)
  }

  async store(id: string, content: StorageContent): Promise<void> {
    if (content.path) {
      try {
        return await fs.promises.rename(content.path, this.getFilePath(id))
      } catch {
        // Failed to move the file. Will try to write it instead
      }
    }
    return fs.promises.writeFile(this.getFilePath(id), content.data)
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        await fs.promises.unlink(this.getFilePath(id))
      } catch (error) {
        // Ignore these errors
      }
    }
  }

  async retrieve(id: string): Promise<ContentItem | undefined> {
    try {
      const filePath = this.getFilePath(id)
      if (await existPath(filePath)) {
        const stat = await fs.promises.stat(filePath)

        return SimpleContentItem.fromStream(fs.createReadStream(filePath), stat.size)
      }
    } catch (error) {}
    return undefined
  }

  async exist(ids: string[]): Promise<Map<string, boolean>> {
    const checks = await Promise.all(
      ids.map<Promise<[string, boolean]>>(async (id) => [id, await existPath(this.getFilePath(id))])
    )
    return new Map(checks)
  }

  private getFilePath(id: string): string {
    return path.join(this.root, id)
  }
}
