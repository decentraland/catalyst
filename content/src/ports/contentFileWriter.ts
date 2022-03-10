import { checkFileExists } from '@dcl/snapshots-fetcher/dist/utils'
import path from 'path'
import { AppComponents } from '../types'

// this component opens file descriptors and enables us to write to them and close all the FD at once
// it also has a buffering algorithm to write to disk less often and reduce IO latency

export type IContentFileWriterComponent<T> = {
  allFiles: Map<T, FileInterface>
  /**
   * Append is debounced. Often the contents of the files are only written after `await close()`
   */
  appendToFile: (file: T, buffer: string) => Promise<void>
  flushToDiskAndCloseFiles: () => Promise<void>
  openFile: (file: T) => Promise<void>
  deleteAllFiles: () => Promise<void>
}

export type FileInterface = {
  close: () => Promise<void>
  appendDebounced: (buffer: string) => Promise<void>
  fileName: string
}

export function createContentFileWriterComponent<T extends symbol | string>(
  components: Pick<AppComponents, 'logs' | 'staticConfigs' | 'fs'>
): IContentFileWriterComponent<T> {
  const logger = components.logs.getLogger('ContentFileWriter')

  const allFiles: Map<T, FileInterface> = new Map()

  function fileNameFromType(type: T): string {
    return path.resolve(
      components.staticConfigs.contentStorageFolder,
      `tmp-snapshot-file-${typeof type == 'symbol' ? 'all' : type}`
    )
  }

  async function getFile(type: T) {
    if (allFiles.has(type)) return allFiles.get(type)!

    const fileName = fileNameFromType(type)

    // if the process failed while creating the snapshot last time the file may still exists
    // deleting the staging tmpFile just in case
    if (await checkFileExists(fileName)) {
      await components.fs.unlink(fileName)
    }

    const file = components.fs.createWriteStream(fileName)

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

    const ret = {
      async close() {
        await flush()
        file.close()
        await fileClosedFuture
      },
      fileName,
      async appendDebounced(buffer: string) {
        writeBuffer.push(buffer)
        if (writeBuffer.length >= MAX_WRITE_BUFFER_SIZE) {
          await flush()
        }
      }
    }

    allFiles.set(type, ret)

    return ret
  }

  return {
    allFiles,
    async appendToFile(type: T, buffer: string) {
      const { appendDebounced } = await getFile(type)

      await appendDebounced(buffer)
    },
    async flushToDiskAndCloseFiles() {
      for (const [_, { close }] of allFiles) {
        await close()
      }
    },
    async openFile(type: T) {
      await getFile(type)
    },
    async deleteAllFiles() {
      for (const [_, { fileName }] of allFiles) {
        if (await checkFileExists(fileName)) {
          try {
            await components.fs.unlink(fileName)
          } catch (err) {
            logger.error(err)
          }
        }
      }
    }
  }
}
