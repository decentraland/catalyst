import { ILoggerComponent } from '@well-known-components/interfaces'
import * as bf from 'bloom-filters'
import PQueue from 'p-queue'
import { AppComponents } from '../types'
import {
  streamAllDistinctContentFileHashes,
  streamAllDistinctEntityIds
} from './database-queries/unreferenced-files-queries'
const { BloomFilter } = bf

function createPerformanceTracer(logger: ILoggerComponent.ILogger) {
  const timers: Map<string, number> = new Map()
  const currentMemoryUsage = () => {
    const memoryUsage = process.memoryUsage()
    return JSON.stringify({
      total: `${Math.round(memoryUsage.heapTotal / 1_000_000)}MB`,
      used: `${Math.round(memoryUsage.heapUsed / 1_000_000)}MB`
    })
  }
  return {
    start(id: string) {
      if (!timers.has(id)) {
        logger.debug(`Starting ${id}. Memory: ${currentMemoryUsage()}`)
        timers.set(id, performance.now())
      } else {
        logger.warn(`Starting timer '${id}' that is already started`)
      }
    },
    end(id: string) {
      const endTime = performance.now()
      const startTime = timers.get(id)
      if (startTime) {
        const elapsedTime = endTime - startTime
        timers.delete(id)
        logger.debug(`Finished ${id}: ${elapsedTime.toFixed(3)}ms. Memory: ${currentMemoryUsage()}`)
        timers.delete(id)
      } else {
        logger.warn(`Ending timer '${id}' that was not started`)
      }
    }
  }
}

export async function deleteUnreferencedFiles(
  components: Pick<AppComponents, 'logs' | 'database' | 'storage'>
): Promise<void> {
  const logger = components.logs.getLogger('UnreferencedFilesDeleter')
  const tracer = createPerformanceTracer(logger)
  const referencedHashesBloom = BloomFilter.create(15_000_000, 0.001)

  const addEntityIdsToBloomFilter = async () => {
    tracer.start('to stream entiy ids + add to bloom filter')
    let totalEntityIds = 0
    for await (const entityId of streamAllDistinctEntityIds(components)) {
      totalEntityIds++
      referencedHashesBloom.add(entityId)
    }
    tracer.end('to stream entiy ids + add to bloom filter')
    return totalEntityIds
  }

  const addContentFileHashesToBloomFilter = async () => {
    tracer.start('to stream content file hashes + add to bloom filter')
    let totalContentFileHashes = 0
    for await (const contentFileHash of streamAllDistinctContentFileHashes(components)) {
      totalContentFileHashes++
      referencedHashesBloom.add(contentFileHash)
    }
    tracer.end('to stream content file hashes + add to bloom filter')
    return totalContentFileHashes
  }

  const addReferencedHashesToBloomFilter = async () => {
    tracer.start('to populate bloom filter')
    const totalEntityIds = await addEntityIdsToBloomFilter()
    const totalContentFileHashes = await addContentFileHashesToBloomFilter()
    tracer.end('to populate bloom filter')
    logger.info(`Created bloom filter with ${totalEntityIds} entity ids and ${totalContentFileHashes} content hashes.`)
  }

  await addReferencedHashesToBloomFilter()

  const queue = new PQueue({ concurrency: 1000 })
  let numberOfDeletedFiles = 0

  for await (const storageFileId of components.storage.allFileIds()) {
    if (!referencedHashesBloom.has(storageFileId)) {
      await queue.add(async () => {
        logger.debug(`Deleting file by bloom filter: ${storageFileId}`)
        // await components.storage.delete([storageFileId])
      })
      numberOfDeletedFiles++
    }
  }
  // To Do: Log size released?
  logger.info(`Deleted ${numberOfDeletedFiles} files`)
}
