import * as bf from 'bloom-filters'
import PQueue from 'p-queue'
import { runLoggingPerformance } from '../instrument'
import { AppComponents } from '../types'
import {
  streamAllDistinctContentFileHashes,
  streamAllDistinctEntityIds
} from './database-queries/unreferenced-files-queries'

export async function deleteUnreferencedFiles(
  components: Pick<AppComponents, 'logs' | 'database' | 'storage' | 'fs'>
): Promise<void> {
  const logger = components.logs.getLogger('UnreferencedFilesDeleter')
  const referencedHashesBloom = bf.BloomFilter.create(15_000_000, 0.001)

  const addAllToBloomFilter = async (streamOfHashes: AsyncIterable<string>): Promise<number> => {
    let totalAddedHashes = 0
    for await (const hash of streamOfHashes) {
      totalAddedHashes++
      referencedHashesBloom.add(hash)
    }
    return totalAddedHashes
  }

  await runLoggingPerformance(logger, 'populate bloom filter', async () => {
    const totalEntityIds = await runLoggingPerformance(
      logger,
      'add stream of entity ids to bloom filter',
      async () => await addAllToBloomFilter(streamAllDistinctEntityIds(components))
    )

    const totalContentFileHashes = await runLoggingPerformance(
      logger,
      'add of stream content file hashes to bloom filter',
      async () => await addAllToBloomFilter(streamAllDistinctContentFileHashes(components))
    )
    logger.info(`Created bloom filter with ${totalEntityIds} entity ids and ${totalContentFileHashes} content hashes.`)
  })

  const queue = new PQueue({ concurrency: 1000 })
  let numberOfDeletedFiles = 0
  logger.info(`Deleting files...`)
  for await (const storageFileId of components.storage.allFileIds()) {
    if (!referencedHashesBloom.has(storageFileId)) {
      await queue.add(async () => {
        try {
          await components.storage.delete([storageFileId])
          numberOfDeletedFiles++
        } catch (error) {
          logger.error(error, { storageFileId })
        }
      })
    }
  }
  logger.info(`Deleted ${numberOfDeletedFiles} files`)
}
