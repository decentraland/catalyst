import { ensureDirectoryExists } from '@catalyst/commons'
import { createReadStream } from 'fs'
import { opendir, stat, unlink } from 'fs/promises'
import ms from 'ms'
import PQueue from 'p-queue'
import { join, resolve } from 'path'
import { AppComponents } from '../../src/types'
import { EnvironmentConfig } from '../Environment'

export type ContentFolderMigrationComponents = Pick<AppComponents, 'logs' | 'env' | 'metrics' | 'storage'>

export async function migrateContentFolderStructure(components: ContentFolderMigrationComponents) {
  const queue = new PQueue({
    concurrency: components.env.getConfig(EnvironmentConfig.FOLDER_MIGRATION_MAX_CONCURRENCY),
    timeout: ms('30s')
  })
  const logs = components.logs.getLogger('ContentFolderMigrationManager')

  let contentsFolder = join(components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')

  while (contentsFolder.endsWith('/')) {
    contentsFolder = contentsFolder.slice(0, -1)
  }

  await ensureDirectoryExists(contentsFolder)

  logs.debug('Running folder migration')

  const files = await opendir(contentsFolder)

  const pending: Promise<void>[] = []
  const failures: string[] = []

  for await (const file of files) {
    pending.push(
      queue.add(async () => {
        try {
          await processFile(components, contentsFolder, file.name)
        } catch (err) {
          logs.error(`Couldn't migrate ${file.name} due to ${err}`)
          failures.push(file.name)
        }
      })
    )
  }

  await Promise.all(pending)

  for (const file of failures) {
    pending.push(
      queue.add(async () => {
        try {
          await processFile(components, contentsFolder, file)
        } catch (err) {
          logs.error(`Retry for ${file} failed due to ${err}`)
          failures.push(file)
        }
      })
    )
  }

  await Promise.all(pending)
}

async function processFile(components: ContentFolderMigrationComponents, folder: string, file: string): Promise<void> {
  const fileName = resolve(folder, file)
  const fileStats = await stat(fileName)

  if (fileStats.isDirectory()) {
    return
  }

  const stream = createReadStream(fileName)

  if (!stream) {
    throw new Error(`Couldn\' t find the file ${file}`)
  }

  await components.storage.storeStream(file, stream)

  await unlink(fileName)

  components.metrics.increment('dcl_files_migrated')
}
