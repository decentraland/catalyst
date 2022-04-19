import * as bf from 'bloom-filters'
import PQueue from 'p-queue'
import { AppComponents } from '../types'
import {
  streamAllDistinctContentFileHashes,
  streamAllDistinctEntityIds
} from './database-queries/unreferenced-files-queries'
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
  // printMemory(`Memory usage before loading hashes:`)
  // const [contentFileHashes, entityFileHashes, storageFileIds] = await Promise.all([
  //   getContentFileHashes(components),
  //   getEntityFileHashes(components),
  //   components.storage.allFileIds()
  // ])
  // printMemory(`Memory usage after loading hashes:`)
  // const fileHashes = new Set(contentFileHashes)
  // entityFileHashes.forEach((hash) => fileHashes.add(hash))
  // printMemory(`Memory usage after loading hashes in Set:`)
  // const bloom = createBloomFilterComponent({ sizeInBytes: 10_485_760 })
  // console.log(`#Content files: ${contentFileHashes.length}`)
  // console.log(`#Entity files: ${entityFileHashes.length}`)
  printMemory(`Memory usage before streaming entity ids`)
  console.time('Creating bloom filter')
  const newBloom = BloomFilter.create(15_000_000, 0.001)
  console.time('Stream entity ids + add to bloomFilter')
  let totalEntityIds = 0
  for await (const entityId of streamAllDistinctEntityIds(components)) {
    totalEntityIds++
    newBloom.add(entityId)
  }
  printMemory(`Memory usage after streaming entity ids`)
  console.timeEnd('Stream entity ids + add to bloomFilter')
  console.time('Stream content file hashes + add to bloomFilter')
  let totalContentFileHashes = 0
  for await (const contentFileHash of streamAllDistinctContentFileHashes(components)) {
    totalContentFileHashes++
    newBloom.add(contentFileHash)
  }
  console.timeEnd('Stream content file hashes + add to bloomFilter')
  printMemory(`Memory usage after streaming content file hashes`)
  // contentFileHashes.forEach((hash) => newBloom.add(hash))
  // entityFileHashes.forEach((hash) => newBloom.add(hash))
  console.timeEnd('Creating bloom filter')
  console.log(`Created bloom filter with: ${totalEntityIds} entity ids and ${totalContentFileHashes} content hashes.`)

  const queue = new PQueue({ concurrency: 1000 })
  let numberOfDeletedFiles = 0
  // let numberOfDeletedFilesByBloom = 0
  // let numberOfDeletedFilesBySet = 0
  const storageFileIds = components.storage.allFileIds()
  for await (const storageFileId of storageFileIds) {
    // const notInBloom = !newBloom.has(storageFileId)
    // const notInSet = !fileHashes.has(storageFileId)
    // let debugMessage: string
    // if (notInBloom && notInSet) {
    //   debugMessage = `Deleting by both: ${storageFileId}`
    //   numberOfDeletedFilesByBloom++
    //   numberOfDeletedFilesBySet++
    // } else if (notInBloom) {
    //   debugMessage = `Deleting by bloom: ${storageFileId}`
    //   numberOfDeletedFilesByBloom++
    // } else if (notInSet) {
    //   debugMessage = `Deleting by set: ${storageFileId}`
    //   numberOfDeletedFilesBySet++
    // }
    // if (!newBloom.has(storageFileId)) {
    // if (!newBloom.has(storageFileId) || !fileHashes.has(storageFileId)) {
    // await queue.add(async () => {
    // logger.debug(debugMessage)
    // await components.storage.delete([storageFileId])
    // })
    // numberOfDeletedFiles++
    if (!newBloom.has(storageFileId)) {
      await queue.add(async () => {
        logger.debug(`Deleting file by bloom filter: ${storageFileId}`)
        // await components.storage.delete([storageFileId])
      })
      numberOfDeletedFiles++
    }
  }
  // To Do: Log size released?
  logger.info(`Deleted ${numberOfDeletedFiles} files`)
  // logger.info(`Deleted ${numberOfDeletedFilesByBloom} files by bloom`)
  // logger.info(`Deleted ${numberOfDeletedFilesBySet} files by set`)
  // logger.info(`False positives in bloom filter: ${numberOfDeletedFilesBySet - numberOfDeletedFilesByBloom}`)
  // logger.info(
  // `False positives rate: ${(numberOfDeletedFilesBySet - numberOfDeletedFilesByBloom) / numberOfDeletedFilesBySet}`
  // )
}
