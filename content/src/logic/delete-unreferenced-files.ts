import PQueue from 'p-queue'
import { createBloomFilterComponent } from '../ports/bloomFilter'
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

  // const fileHashes = new Set(contentFileHashes)
  // entityFileHashes.forEach((hash) => fileHashes.add(hash))
  const bloom = createBloomFilterComponent({ sizeInBytes: 10_485_760 })
  contentFileHashes.forEach((hash) => bloom.add(hash))
  entityFileHashes.forEach((hash) => bloom.add(hash))

  const queue = new PQueue({ concurrency: 10 })

  let numberOfDeletedFiles = 0
  for await (const storageFileId of storageFileIds) {
    // if (!fileHashes.has(storageFileId)) {
    if (!bloom.check(storageFileId)) {
      await queue.add(async () => {
        logger.debug(`Deleting: ${storageFileId}`)
        // await components.storage.delete([storageFileId])
      })
      numberOfDeletedFiles++
    }
  }
  // To Do: Log size released?
  logger.info(`Deleted ${numberOfDeletedFiles} files`)
}
