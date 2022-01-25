import { ensureDirectoryExists, existPath } from '@catalyst/commons'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { pipeline, Readable } from 'stream'
import { promisify } from 'util'
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
    while (root.endsWith('/')) {
      root = root.slice(0, -1)
    }
    await ensureDirectoryExists(root)
    return new FileSystemContentStorage(root)
  }

  store(id: string, content: Uint8Array, encoding?: ContentEncoding): Promise<void> {
    return fs.promises.writeFile(this.getFilePath(id, encoding), content)
  }

  async storeStream(id: string, stream: Readable, encoding?: ContentEncoding): Promise<void> {
    await pipe(stream, fs.createWriteStream(this.getFilePath(id, encoding)))
  }

  storeContent(id: string, content: Uint8Array | Readable, encoding?: ContentEncoding): Promise<void> {
    if (content instanceof Uint8Array || Buffer.isBuffer(content)) {
      return this.store(id, content, encoding)
    } else {
      return this.storeStream(id, content, encoding)
    }
  }

  async storeFromFile(id: string, filePath: string, encoding?: ContentEncoding): Promise<void> {
    return fs.promises.rename(filePath, this.getFilePath(id, encoding))
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await noFailUnlink(this.getFilePath(id))
      await noFailUnlink(this.getFilePath(id, 'gzip'))
    }
  }

  async retrieve(id: string): Promise<ContentItem | undefined> {
    try {
      return (await this.retrieveWithEncoding(id, 'gzip')) || (await this.retrieveWithEncoding(id, null))
    } catch (error) {
      console.error(`error getting content id ${id}: ${error}`)
    }
    return undefined
  }

  private async retrieveWithEncoding(id: string, encoding: ContentEncoding | null): Promise<ContentItem | undefined> {
    const filePath = encoding ? this.getFilePath(id, encoding) : this.getFilePath(id)
    const extension = encoding ? '.' + encoding : ''
    if (await existPath(filePath + extension)) {
      const stat = await fs.promises.stat(filePath + extension)
      return new SimpleContentItem(async () => fs.createReadStream(filePath + extension), stat.size, encoding)
    }
  }

  async stats(id: string): Promise<{ size: number } | undefined> {
    const filePath = this.getFilePath(id)
    if (await existPath(filePath)) {
      try {
        return await fs.promises.stat(filePath)
      } catch (e) {}
    }
  }

  async exist(ids: string[]): Promise<Map<string, boolean>> {
    const checks = await Promise.all(
      ids.map<Promise<[string, boolean]>>(async (id) => [id, !!(await this.retrieve(id))])
    )
    return new Map(checks)
  }

  async size(id: string): Promise<number | undefined> {
    return (await this.stats(id))?.size
  }

  async storeExistingContentItem(id: string, oldContentPath: string): Promise<void> {
    return fs.promises.rename(path.join(oldContentPath, id), this.getFilePath(id))
  }

  private getFilePath(id: string, encoding?: ContentEncoding): string {
    // We are sharding the files using the first 4 digits of its sha1 hash, because it makes troubles
    // for the file system to handle millions of files in the same directory.
    // This way, asuming that sha1 hash distribution is ~uniform we are reducing by 16^4 the max amount of files in a directory.
    const directoryPath = path.join(this.root, createHash('sha1').update(id).digest('hex').substring(0, 4))
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true })
    }
    const filePath = path.join(directoryPath, id)
    return encoding ? filePath + '.' + encoding : filePath
  }
}
