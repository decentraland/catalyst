import PQueue from 'p-queue'
import { join, resolve } from 'path'
import { AppComponents } from '../../src/types'
import { EnvironmentConfig } from '../Environment'

export type ContentFolderMigrationComponents = Pick<AppComponents, 'logs' | 'env' | 'metrics' | 'storage' | 'fs'>

export async function migrateContentFolderStructure(components: ContentFolderMigrationComponents) {
  const queue = new PQueue({
    concurrency: components.env.getConfig(EnvironmentConfig.FOLDER_MIGRATION_MAX_CONCURRENCY)
  })
  const logs = components.logs.getLogger('ContentFolderMigrationManager')

  let contentsFolder = join(components.env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), 'contents')

  while (contentsFolder.endsWith('/')) {
    contentsFolder = contentsFolder.slice(0, -1)
  }

  await components.fs.ensureDirectoryExists(contentsFolder)

  logs.debug('Running folder migration')

  const files = await components.fs.opendir(contentsFolder)

  const failures: string[] = []
  const queued: Promise<void>[] = []
  let migratedCount = 0

  for await (const file of files) {
    if (file.isDirectory()) {
      continue
    }
    const promise = queue.add(async () => {
      try {
        await processFile(components, contentsFolder, file.name)

        migratedCount++
        if (migratedCount % 10000 == 0) {
          logs.debug(`Migrated ${migratedCount} files`)
        }
      } catch (err) {
        logs.error(`Couldn't migrate ${file.name} due to ${err}`)
        failures.push(file.name)
      }
    })

    const wrappedPromise = async () => {
      try {
        await promise
      } catch (error) {
        logs.error(`Error while adding ${file.name} to the queue`)
        failures.push(file.name)
      }
    }

    queued.push(wrappedPromise())
  }

  try {
    await Promise.all(queued)
    logs.info(`Migrated ${migratedCount} files`)
  } catch (err) {
    logs.error(`Failure while migrating ${err}`)
    throw Error(failures.join('\n'))
  }

  await queue.onIdle()

  if (failures.length > 0) {
    throw Error(failures.join('\n'))
  }
}

async function processFile(components: ContentFolderMigrationComponents, folder: string, file: string): Promise<void> {
  const fileName = resolve(folder, file)
  const fileStats = await components.fs.stat(fileName)

  if (fileStats.isDirectory()) {
    return
  }

  const stream = components.fs.createReadStream(fileName)

  if (!stream) {
    throw new Error(`Couldn\' t find the file ${file}`)
  }

  await components.storage.storeStream(file, stream)

  await components.fs.unlink(fileName)

  components.metrics.increment('dcl_files_migrated')
}
