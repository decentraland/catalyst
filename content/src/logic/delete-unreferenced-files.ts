import * as bf from 'bloom-filters'
import PQueue from 'p-queue'
import { AppComponents } from '../types'
import { getContentFileHashes, getEntityFileHashes } from './database-queries/unreferenced-files-queries'
const { BloomFilter } = bf

function printMemory(memoryMessage: string) {
  console.log(memoryMessage)
  const memoryUsage = process.memoryUsage()
  const initBytesBefore = {
    total: `${Math.round(memoryUsage.heapTotal / 1_000_000)}MB`,
    used: `${Math.round(memoryUsage.heapUsed / 1_000_000)}MB`
  }
  console.log(initBytesBefore)
}

export async function deleteUnreferencedFiles(
  components: Pick<AppComponents, 'logs' | 'database' | 'storage'>
): Promise<void> {
  const logger = components.logs.getLogger('UnreferencedFilesDeleter')
  printMemory(`Memory usage before loading hashes:`)
  const [contentFileHashes, entityFileHashes, storageFileIds] = await Promise.all([
    getContentFileHashes(components),
    getEntityFileHashes(components),
    components.storage.allFileIds()
  ])
  printMemory(`Memory usage after loading hashes:`)
  const fileHashes = new Set(contentFileHashes)
  entityFileHashes.forEach((hash) => fileHashes.add(hash))
  printMemory(`Memory usage after loading hashes in Set:`)
  // const bloom = createBloomFilterComponent({ sizeInBytes: 10_485_760 })
  console.log(`#Content files: ${contentFileHashes.length}`)
  console.log(`#Entity files: ${entityFileHashes.length}`)
  console.time('Creating bloom filter')
  const newBloom = BloomFilter.create(15_000_000, 0.001)
  contentFileHashes.forEach((hash) => newBloom.add(hash))
  entityFileHashes.forEach((hash) => newBloom.add(hash))
  console.timeEnd('Creating bloom filter')
  printMemory(`Memory usage after loading hashes in bloom filter:`)

  const queue = new PQueue({ concurrency: 10 })

  let numberOfDeletedFiles = 0
  let numberOfDeletedFilesByBloom = 0
  let numberOfDeletedFilesBySet = 0
  for await (const storageFileId of storageFileIds) {
    const notInBloom = !newBloom.has(storageFileId)
    const notInSet = !fileHashes.has(storageFileId)
    let debugMessage: string
    if (notInBloom && notInSet) {
      debugMessage = `Deleting by both: ${storageFileId}`
      numberOfDeletedFilesByBloom++
      numberOfDeletedFilesBySet++
    }
    if (notInBloom) {
      debugMessage = `Deleting by bloom: ${storageFileId}`
      numberOfDeletedFilesByBloom++
    }
    if (notInSet) {
      debugMessage = `Deleting by set: ${storageFileId}`
      numberOfDeletedFilesBySet++
    }

    // if (!newBloom.has(storageFileId)) {
    if (!newBloom.has(storageFileId) || !fileHashes.has(storageFileId)) {
      await queue.add(async () => {
        logger.debug(debugMessage)
        // await components.storage.delete([storageFileId])
      })
      numberOfDeletedFiles++
    }
  }
  // To Do: Log size released?
  logger.info(`Deleted ${numberOfDeletedFiles} files`)
  logger.info(`Deleted ${numberOfDeletedFilesByBloom} files by bloom`)
  logger.info(`Deleted ${numberOfDeletedFilesBySet} files by set`)
  logger.info(`False positives in bloom filter: ${numberOfDeletedFilesBySet - numberOfDeletedFilesByBloom}`)
  logger.info(
    `False positives rate: ${(numberOfDeletedFilesBySet - numberOfDeletedFilesByBloom) / numberOfDeletedFilesBySet}`
  )
}
