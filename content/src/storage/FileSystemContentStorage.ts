import { ensureDirectoryExists, existPath } from '@catalyst/commons'
import { createHash } from 'crypto'
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

  async storeStreamAndCompress(id: string, stream: Readable): Promise<void> {
    await this.storeStream(id, stream)
    if (await compressContentFile(this.getFilePath(id))) {
      // try to remove original file if present
      const compressed = await this.retrieve(id)
      if (compressed) {
        const raw = await compressed.asRawStream()
        if (raw.encoding) {
          await noFailUnlink(this.getFilePath(id))
        }
      }
    }
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await noFailUnlink(this.getFilePath(id))
      await noFailUnlink(this.getFilePath(id) + '.gzip')
    }
  }

  private async retrieveWithEncoding(id: string, encoding: ContentEncoding | null): Promise<ContentItem | undefined> {
    const extension = encoding ? '.' + encoding : ''
    const filePath = this.getFilePath(id) + extension

    if (await existPath(filePath)) {
      const stat = await fs.promises.stat(filePath)
      return new SimpleContentItem(async () => fs.createReadStream(filePath), stat.size, encoding)
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
    // We are sharding the files using the first 4 digits of its sha1 hash, because it makes troubles
    // for the file system to handle millions of files in the same directory.
    // This way, asuming that sha1 hash distribution is ~uniform we are reducing by 16^4 the max amount of files in a directory.
    const directoryPath = path.join(this.root, createHash('sha1').update(id).digest('hex').substring(0, 4))
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true })
    }
    const filePath = path.join(directoryPath, id)
    return filePath
  }
}
