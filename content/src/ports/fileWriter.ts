import { hashV1 } from '@dcl/hashing'
import { checkFileExists } from '@dcl/snapshots-fetcher/dist/utils'
import crypto from 'crypto'
import path from 'path'
import { AppComponents } from '../types'

export type IFile = {
  filePath: string
  appendDebounced: (buffer: string) => Promise<void>
  close: () => Promise<void>
  delete: () => Promise<void>
  store: () => Promise<string>
}

export async function createFileWriter(
  components: Pick<AppComponents, 'logs' | 'staticConfigs' | 'fs' | 'storage'>,
  filenamePrefix?: string
): Promise<IFile> {
  const logger = components.logs.getLogger('file-writer')
  const tmpFilename = `${filenamePrefix}${crypto.randomUUID()}`
  const filePath = path.resolve(components.staticConfigs.contentStorageFolder, tmpFilename)

  // if the process failed while creating the snapshot last time the file may still exists
  // deleting the staging tmpFile just in case
  if (await checkFileExists(filePath)) {
    await components.fs.unlink(filePath)
  }

  const file = components.fs.createWriteStream(filePath)

  const fileClosedFuture = new Promise<void>((resolve, reject) => {
    file.on('finish', resolve)
    file.on('end', resolve)
    file.on('error', reject)
  })

  // the follosing lines exist to naively emulate a buffering algorithm to reduce disk IO
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

  async function close() {
    await flush()
    file.close()
    await fileClosedFuture
  }

  async function deleteFile() {
    if (await checkFileExists(filePath)) {
      try {
        await components.fs.unlink(filePath)
      } catch (err) {
        logger.error(err)
      }
    }
  }

  return {
    filePath,
    async appendDebounced(buffer: string) {
      writeBuffer.push(buffer)
      if (writeBuffer.length >= MAX_WRITE_BUFFER_SIZE) {
        await flush()
      }
    },
    close,
    delete: deleteFile,
    async store() {
      await close()
      const hash = await hashV1(components.fs.createReadStream(filePath) as any)
      const hasContent = await components.storage.retrieve(hash)

      if (!hasContent) {
        // move and compress the file into the destinationFilename
        await components.storage.storeStreamAndCompress(hash, components.fs.createReadStream(filePath))
        logger.info(`File ${filePath} stored with hash=${hash}`)
      }
      await deleteFile()
      return hash
    }
  }
}
