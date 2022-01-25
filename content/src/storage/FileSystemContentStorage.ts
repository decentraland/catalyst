import { ensureDirectoryExists, existPath } from '@catalyst/commons'
import { createHash, randomBytes } from 'crypto'
import { once } from 'events'
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
  private constructor(private root: string, private tmpDir: string) {}

  static async build(root: string): Promise<FileSystemContentStorage> {
    while (root.endsWith('/')) {
      root = root.slice(0, -1)
    }
    const tmpDir = path.join(root, '/__tmp')
    await ensureDirectoryExists(root)
    await ensureDirectoryExists(tmpDir)
    return new FileSystemContentStorage(root, tmpDir)
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

  async storeExistingContentItem(currentFilePath: string, id: string): Promise<void> {
    return fs.promises.rename(currentFilePath, this.getFilePath(id))
  }

  create(id: string): UnsavedContentItem {
    // Check if it doesn't exist
    return createUnsavedContentItem(id, this.getTmpFilePath(), this.getFilePath(id))
  }

  private getFilePath(id: string): string {
    // We are sharding the files using the first 4 digits of its sha1 hash, because it makes troubles
    // for the file system to handle millions of files in the same directory.
    // This way, asuming that sha1 hash distribution is ~uniform we are reducing by 16^4 the max amount of files in a directory.
    const directoryPath = path.join(this.root, createHash('sha1').update(id).digest('hex').substring(0, 4))
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true })
    }
    return path.join(directoryPath, id)
  }

  private getTmpFilePath(): string {
    return path.join(this.tmpDir, randomBytes(32).toString('hex'))
  }
}

function createUnsavedContentItem(id: string, tmpFilePath: string, onSaveFilePath: string): UnsavedContentItem {
  const file = fs.createWriteStream(tmpFilePath)
  let wasSaved = false
  let wasAborted = false
  let lastTimeEdition = new Date()

  // the following lines exist to naively emulate a buffering algorithm to reduce disk IO
  // and thus, block the disk for less time using more memory
  const MAX_WRITE_BUFFER_SIZE = 1000
  const writeBuffer: Array<string> = []
  async function flush() {
    if (writeBuffer.length) {
      const buffer = writeBuffer.join('')
      writeBuffer.length = 0
      lastTimeEdition = new Date()
      await new Promise<void>(async (resolve, reject) => {
        if (
          !file.write(buffer, (err) => {
            if (err) reject(err)
            else resolve()
          })
        ) {
          await once(file, 'drain')
        }
      })
    }
  }

  const abortFunction = async () => {
    file.destroy()
    wasAborted = true
    console.log(tmpFilePath)
    return new Promise<void>((resolve, reject) => {
      file.on('close', resolve)
      file.on('error', reject)
    }).then(() => {
      fs.rmSync(tmpFilePath, { force: true })
    })
  }

  setTimeout(async function abortIfNeeded() {
    const now = new Date()
    const minutesOfDifference = (now.getTime() - lastTimeEdition.getTime()) / 1000 / 60
    const couldBeAborted = !wasSaved || wasAborted
    if (couldBeAborted && minutesOfDifference > 5) {
      await abortFunction()
    } else {
      setTimeout(abortIfNeeded, 600000)
    }
  }, 600000)

  return {
    async append(buffer: string) {
      if (wasAborted || wasSaved) {
        throw new Error('Can not append to a file that was aborted or saved.')
      }
      writeBuffer.push(buffer)
      if (writeBuffer.length >= MAX_WRITE_BUFFER_SIZE) {
        await flush()
      }
    },
    async save() {
      if (!wasSaved && !wasAborted) {
        await flush()
        file.close()
        await new Promise<void>((resolve, reject) => {
          file.on('finish', resolve)
          file.on('close', resolve)
          file.on('end', resolve)
          file.on('error', reject)
        })
        if (!fs.existsSync(tmpFilePath)) {
          console.error(`Tring to save unexistent tmp file ${tmpFilePath}`)
        }
        fs.renameSync(tmpFilePath, onSaveFilePath)
        wasSaved = true
      }
      return wasSaved
    },
    async abort() {
      await abortFunction()
    }
  }
}
