import { ensureDirectoryExists, existPath } from '@catalyst/commons'
import fs from 'fs'
import path from 'path'
import { pipeline, Readable } from 'stream'
import { promisify } from 'util'
import { compressContentFile } from './compression'
import { ContentEncoding, ContentItem, ContentStorage, SimpleContentItem } from './ContentStorage'
const pipe = promisify(pipeline)

async function noFailUnlink(path: string) {
  try {
    await fs.promises.unlink(path)
  } catch (error) {
    // Ignore these errors
  }
}

export class FileSystemContentStorage implements ContentStorage {
  private constructor(private root: string) {}

  static async build(root: string): Promise<FileSystemContentStorage> {
    // remove path separators / \ from the end of the folder
    while (root.endsWith(path.sep)) {
      root = root.slice(0, -1)
    }
    await ensureDirectoryExists(root)
    return new FileSystemContentStorage(root)
  }

  async storeStream(id: string, stream: Readable): Promise<void> {
    await pipe(stream, fs.createWriteStream(this.getFilePath(id)))
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await noFailUnlink(this.getFilePath(id))
      await noFailUnlink(this.getFilePath(id) + '.gzip')
    }
  }

  // returns true if the file was successfuly compressed
  async compress(id: string): Promise<boolean> {
    const uncompressed = await this.retrieveWithEncoding(id, null)
    if (uncompressed) {
      return await compressContentFile(this.getFilePath(id))
    }
    return false
  }

  private async retrieveWithEncoding(id: string, encoding: ContentEncoding | null): Promise<ContentItem | undefined> {
    const filePath = this.getFilePath(id)
    const extension = encoding ? '.' + encoding : ''

    if (await existPath(filePath + extension)) {
      const stat = await fs.promises.stat(filePath + extension)
      return new SimpleContentItem(async () => fs.createReadStream(filePath + extension), stat.size, encoding)
    }
  }

  async retrieve(id: string): Promise<ContentItem | undefined> {
    try {
      return (await this.retrieveWithEncoding(id, 'gzip')) || (await this.retrieveWithEncoding(id, null))
    } catch (error) {
      console.error(error)
    }
    return undefined
  }

  async exist(id: string): Promise<boolean> {
    return !!(await this.retrieve(id))
  }

  async existMultiple(ids: string[]): Promise<Map<string, boolean>> {
    const checks = await Promise.all(
      ids.map<Promise<[string, boolean]>>(async (id) => [id, !!(await this.retrieve(id))])
    )
    return new Map(checks)
  }

  private getFilePath(id: string): string {
    return path.join(this.root, id)
  }
}
