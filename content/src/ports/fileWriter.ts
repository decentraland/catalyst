import { checkFileExists } from '@dcl/snapshots-fetcher/dist/utils'
import path from 'path'
import { AppComponents } from '../types'

export type IFile = {
  filePath: string
  appendDebounced: (buffer: string) => Promise<void>
  close: () => Promise<void>
}

export async function createContentFileWriter(
  components: Pick<AppComponents, 'logs' | 'staticConfigs' | 'fs'>,
  filename: string
): Promise<IFile> {
  const filePath = path.resolve(components.staticConfigs.contentStorageFolder, filename)

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

  return {
    filePath,
    async appendDebounced(buffer: string) {
      writeBuffer.push(buffer)
      if (writeBuffer.length >= MAX_WRITE_BUFFER_SIZE) {
        await flush()
      }
    },
    async close() {
      await flush()
      file.close()
      await fileClosedFuture
    }
  }
}
