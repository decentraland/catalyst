import { ensureDirectoryExists } from '@catalyst/commons'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { readdir } from 'fs/promises'
import { join } from 'path'
import { AppComponents } from 'src/types'
import { EnvironmentConfig } from '../Environment'
import { moveFile } from '../helpers/files'

export class ContentFolderMigrationManager {
  logs: ILoggerComponent.ILogger
  contentsFolder: string
  blockSize: number

  constructor(components: Pick<AppComponents, 'logs' | 'env'>) {
    this.logs = components.logs.getLogger('ContentFolderMigrationManager')

    this.contentsFolder = join(components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    this.blockSize = components.env.getConfig(EnvironmentConfig.FOLDER_MIGRATION_BLOCK_SIZE)
  }

  async run(): Promise<void> {
    while (this.contentsFolder.endsWith('/')) {
      this.contentsFolder = this.contentsFolder.slice(0, -1)
    }

    await ensureDirectoryExists(this.contentsFolder)

    this.logs.debug('Running folder migration')

    const files = await readdir(this.contentsFolder)

    let failures = await migrateFiles(files, this.blockSize, this.contentsFolder, this.logs)
    let retries = 0

    while (retries < 3 && failures.length > 0) {
      failures = await migrateFiles(failures, this.blockSize, this.contentsFolder, this.logs)
      retries++
    }
  }
}

async function migrateFiles(
  files: string[],
  blockSize: number,
  contentsFolder: string,
  logger: ILoggerComponent.ILogger
): Promise<string[]> {
  const iteration = iterateArray(files, blockSize)

  let block = iteration.next()

  let migrated = 0

  const failures: string[] = []

  while (!block.done && block.value.length > 0) {
    await Promise.all(
      block.value.map((file) => {
        try {
          return moveFile(file, contentsFolder, getPath(file))
        } catch (err) {
          logger.error(`Couldn't move ${file} due to ${err}`)
          failures.push(file)
        }
      })
    )

    migrated += block.value.length

    logger.info(`Migrated ${migrated} files`)

    block = iteration.next()
  }

  return failures
}

function* iterateArray<T>(array: Array<T>, blockSize: number) {
  let currentIndex = 0

  while (currentIndex < array.length) {
    yield array.slice(currentIndex, currentIndex + blockSize)

    currentIndex += blockSize
  }
}

function getPath(fileName: string): string {
  return fileName
}
