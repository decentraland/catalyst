import PQueue from 'p-queue'
import { AppComponents } from '../types'
import { getContentFileHashes, getEntityFileHashes } from './database-queries/unreferenced-files-queries'

export async function deleteUnreferencedFiles(
  components: Pick<AppComponents, 'logs' | 'database' | 'storage'>
): Promise<void> {
  const logger = components.logs.getLogger('UnreferencedFilesDeleter')

  const [contentFileHashes, entityFileHashes, storageFileIds] = await Promise.all([
    getContentFileHashes(components),
    getEntityFileHashes(components),
    components.storage.allFileIds()
  ])

  const fileHashes = new Set(contentFileHashes)
  entityFileHashes.forEach((hash) => fileHashes.add(hash))

  const queue = new PQueue({ concurrency: 10 })

  let numberOfDeletedFiles = 0
  for await (const storageFileId of storageFileIds) {
    if (!fileHashes.has(storageFileId)) {
      await queue.add(async () => await components.storage.delete([storageFileId]))
      console.log(`Deleting: ${storageFileId}`)
      await components.storage.delete([storageFileId])
      numberOfDeletedFiles++
    }
  }
  // To Do: Log size released?
  logger.info(`Deleted ${numberOfDeletedFiles} files`)
}
