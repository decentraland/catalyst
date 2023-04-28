import { TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { IBaseComponent } from '@well-known-components/interfaces'
import * as bf from 'bloom-filters'
import future from 'fp-future'
import { streamAllEntityIdsInTimeRange } from '../logic/database-queries/deployments-queries'
import { joinOverlappedTimeRanges } from '../logic/time-range'
import { AppComponents } from '../types'

export type DeployedEntitiesBloomFilter = {
  add(entityId: string): void
  isProbablyDeployed(entityId: string, entityTimestamp: number): Promise<boolean>
  addAllInTimeRange(timeRange: TimeRange): Promise<void>
}

export function createDeployedEntitiesBloomFilter(
  components: Pick<AppComponents, 'database' | 'logs' | 'clock'>
): DeployedEntitiesBloomFilter & IBaseComponent {
  const logger = components.logs.getLogger('deployedEntitiesBloomFilter')

  const deploymentsBloomFilter = bf.BloomFilter.create(5_000_000, 0.001)

  const initialized = future<void>()

  let loadedTimeRanges: TimeRange[] = []

  let startedTimestamp: undefined | number

  function isTimeRangeLoaded(timeRange: TimeRange) {
    return loadedTimeRanges.some(
      (loadedTimeRange: TimeRange) =>
        loadedTimeRange.initTimestamp <= timeRange.initTimestamp &&
        loadedTimeRange.endTimestamp >= timeRange.endTimestamp
    )
  }

  function addTimeRangeLoaded(timeRange: TimeRange) {
    loadedTimeRanges.push(timeRange)
    loadedTimeRanges = joinOverlappedTimeRanges(loadedTimeRanges)
  }

  async function addAllInTimeRange(timeRange: TimeRange) {
    if (isTimeRangeLoaded(timeRange)) {
      return
    }
    const start = components.clock.now()
    const interval = `[${new Date(timeRange.initTimestamp).toISOString()}, ${new Date(
      timeRange.endTimestamp
    ).toISOString()}]`
    logger.info(`Loading bloom filter.`, { interval })
    let elements = 0
    for await (const entityId of streamAllEntityIdsInTimeRange(components, timeRange)) {
      elements++
      deploymentsBloomFilter.add(entityId)
    }
    logger.info(`Bloom filter loaded in.`, {
      interval,
      timeMs: components.clock.now() - start,
      elements
    })
    addTimeRangeLoaded(timeRange)
  }

  return {
    add(entityId: string) {
      deploymentsBloomFilter.add(entityId)
    },
    async isProbablyDeployed(entityId: string, entityTimestamp: number) {
      await initialized
      const isTimestampLoaded =
        entityTimestamp > startedTimestamp! ||
        loadedTimeRanges.some(
          (timeRange) => timeRange.initTimestamp <= entityTimestamp && timeRange.endTimestamp >= entityTimestamp
        )
      if (isTimestampLoaded) {
        return deploymentsBloomFilter.has(entityId)
      }
      logger.info(`Entity timestamp not loading in bloom filter $${entityTimestamp}`)
      return true
    },
    async start() {
      const twentyMinutesAgo = components.clock.now() - 1000 * 60 * 15
      await addAllInTimeRange({ initTimestamp: twentyMinutesAgo, endTimestamp: components.clock.now() })
      initialized.resolve()
      startedTimestamp = components.clock.now()
    },
    addAllInTimeRange
  }
}
