import { ensureDirectoryExists, existPath } from '@catalyst/commons'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { pipeline, Readable } from 'stream'
import { promisify } from 'util'
import { ContentEncoding, ContentItem, ContentStorage, SimpleContentItem, UnsavedContentItem } from './ContentStorage'

const pipe = promisify(pipeline)

async function noFailUnlink(path: string) {
  try {
    await fs.promises.unlink(path)
  } catch (error) {
    // Ignore these errors
  }
}

export class FileSystemContentStorage implements ContentStorage {
  private tmpDir: string
  private constructor(private root: string) {
    this.tmpDir = path.join(root, '/tmp')
  }

  static async build(root: string): Promise<FileSystemContentStorage> {
    while (root.endsWith('/')) {
      root = root.slice(0, -1)
    }
    await ensureDirectoryExists(root)
    return new FileSystemContentStorage(root)
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await noFailUnlink(this.getFilePath(id))
      await noFailUnlink(this.getFilePath(id) + '.gzip')
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

  private async retrieveWithEncoding(id: string, encoding: ContentEncoding | null): Promise<ContentItem | undefined> {
    const filePath = this.getFilePath(id)
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

  async store(id: string, content: Uint8Array | Readable): Promise<void> {
    if (content instanceof Uint8Array || Buffer.isBuffer(content)) {
      return fs.promises.writeFile(this.getFilePath(id), content)
    } else {
      return pipe(content, fs.createWriteStream(this.getFilePath(id)))
    }
  }

  async size(id: string): Promise<number | undefined> {
    return (await this.stats(id))?.size
  }

  // async fixContentItem(id: string, oldContentPath: string): Promise<void> {
  //     // TODO: move con rename -> es solamente mover punteros, mv hace
  //     // await fs.promises.rename(path.join(oldFolder, fileName), path.join(newFolder, fileName))
  // }

  create(id: string): UnsavedContentItem {
    // Check if it doesn't exist
    return createUnsavedContentItem(id, this.getTmpFilePath(id), this.getFilePath(id))
  }

  private getFilePath(id: string): string {
    return this.getFilePathFor(this.root, id)
  }

  private getTmpFilePath(id: string): string {
    return this.getFilePathFor(this.tmpDir, id)
  }

  private getFilePathFor(prefixDir: string, id: string): string {
    // We are sharding the files using the first 4 digits of its sha1 hash, because it makes troubles
    // for the file system to handle millions of files in the same directory.
    // This way, asuming that sha1 hash distribution is ~uniform we are reducing by 16^4 the max amount of files in a directory.
    const directoryPath = path.join(prefixDir, createHash('sha1').update(id).digest('hex').substring(0, 4))
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true })
    }
    return path.join(directoryPath, id)
  }
}

export function createUnsavedContentItem(id: string, tmpFilePath: string, onSaveFilePath: string): UnsavedContentItem {
  // TODO: remove file if it already exists
  console.log(tmpFilePath)
  const file = fs.createWriteStream(tmpFilePath)

  // the following lines exist to naively emulate a buffering algorithm to reduce disk IO
  // and thus, block the disk for less time using more memory
  const MAX_WRITE_BUFFER_SIZE = 1000
  const writeBuffer: Array<string> = []
  async function flush() {
    if (writeBuffer.length) {
      const buffer = writeBuffer.join('')
      writeBuffer.length = 0
      await new Promise<void>((resolve, reject) => {
        file.write(buffer, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
  }

  const fileClosedFuture = new Promise<void>((resolve, reject) => {
    file.on('finish', resolve)
    file.on('end', resolve)
    file.on('error', reject)
  })

  return {
    async append(buffer: string) {
      writeBuffer.push(buffer)
      if (writeBuffer.length >= MAX_WRITE_BUFFER_SIZE) {
        await flush()
      }
    },
    async save() {
      await flush()
      file.close()
      await fileClosedFuture
      fs.renameSync(tmpFilePath, onSaveFilePath)
    }
  }
}
