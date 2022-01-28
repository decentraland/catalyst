import { ensureDirectoryExists } from '@catalyst/commons'
import { ILoggerComponent, IMetricsComponent } from '@well-known-components/interfaces'
import { createReadStream } from 'fs'
import { opendir, stat } from 'fs/promises'
import ms from 'ms'
import PQueue from 'p-queue'
import { join, resolve } from 'path'
import { AppComponents } from 'src/types'
import { EnvironmentConfig } from '../Environment'
import { metricsDeclaration } from '../metrics'
import { FileSystemContentStorage } from '../storage/FileSystemContentStorage'

export class ContentFolderMigrationManager {
  logs: ILoggerComponent.ILogger
  metrics: IMetricsComponent<keyof typeof metricsDeclaration>
  contentsFolder: string
  concurrency: number
  queue: PQueue
  storage: FileSystemContentStorage

  constructor(components: Pick<AppComponents, 'logs' | 'env' | 'metrics'> & { storage: FileSystemContentStorage }) {
    this.logs = components.logs.getLogger('ContentFolderMigrationManager')

    this.contentsFolder = join(components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')
    this.concurrency = components.env.getConfig(EnvironmentConfig.FOLDER_MIGRATION_MAX_CONCURRENCY)
    this.queue = new PQueue({ concurrency: this.concurrency, timeout: ms('30s') })
    this.metrics = components.metrics
    this.storage = components.storage
  }

  async run(): Promise<void> {
    while (this.contentsFolder.endsWith('/')) {
      this.contentsFolder = this.contentsFolder.slice(0, -1)
    }

    await ensureDirectoryExists(this.contentsFolder)

    this.logs.debug('Running folder migration')

    const files = await opendir(this.contentsFolder)

    const pending: Promise<void>[] = []
    const failures: string[] = []

    for await (const file of files) {
      pending.push(
        this.queue.add(async () => {
          try {
            await this.processFile(file.name)
          } catch (err) {
            this.logs.error(`Couldn't migrate ${file.name} due to ${err}`)
            failures.push(file.name)
          }
        })
      )
    }

    await Promise.all(pending)

    for (const file of failures) {
      pending.push(
        this.queue.add(async () => {
          try {
            await this.processFile(file)
          } catch (err) {
            this.logs.error(`Retry for ${file} failed due to ${err}`)
            failures.push(file)
          }
        })
      )
    }

    await Promise.all(pending)
  }

  pendingInQueue(): number {
    return this.queue.size
  }

  private async processFile(file: string): Promise<void> {
    const fileName = resolve(this.contentsFolder, file)
    const fileStats = await stat(fileName)

    if (fileStats.isDirectory()) {
      return
    }

    const stream = createReadStream(fileName)

    if (!stream) {
      throw new Error(`Couldn\' t find the file ${file}`)
    }

    await this.storage.storeStream(file, stream)

    this.metrics.increment('dcl_files_migrated')
  }
}
