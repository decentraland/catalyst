import { TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { IBaseComponent } from '@well-known-components/interfaces'
import * as bf from 'bloom-filters'
import future from 'fp-future'
import { joinOverlappedTimeRanges } from '../../logic/time-range'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { DeployedEntitiesBloomFilter } from './types'

export function createDeployedEntitiesBloomFilter(
  components: Pick<AppComponents, 'database' | 'logs' | 'deploymentsRepository' | 'env'>
): DeployedEntitiesBloomFilter & IBaseComponent {
  const logger = components.logs.getLogger('deployedEntitiesBloomFilter')

  // Sized via BLOOM_FILTER_EXPECTED_ELEMENTS. Past capacity the false-positive rate climbs and each FP
  // costs an extra deploymentExists query on the sync path — track the deployments-table size
  // (metric: dcl_deployed_entities_bloom_filter_checks_total{hit="false"}).
  const expectedElements = components.env.getConfig<number>(EnvironmentConfig.BLOOM_FILTER_EXPECTED_ELEMENTS)
  const deploymentsBloomFilter = bf.BloomFilter.create(expectedElements, 0.001)

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
    const start = Date.now()
    const interval = `[${new Date(timeRange.initTimestamp).toISOString()}, ${new Date(
      timeRange.endTimestamp
    ).toISOString()}]`
    logger.info(`Loading bloom filter.`, { interval })
    let elements = 0
    for await (const entityId of components.deploymentsRepository.streamAllEntityIdsInTimeRange(
      components.database,
      timeRange
    )) {
      elements++
      deploymentsBloomFilter.add(entityId)
    }
    logger.info(`Bloom filter loaded in.`, {
      interval,
      timeMs: Date.now() - start,
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
      logger.info(`Entity timestamp not loaded in bloom filter ${entityTimestamp}`)
      return true
    },
    async start() {
      const twentyMinutesAgo = Date.now() - 1000 * 60 * 15
      await addAllInTimeRange({ initTimestamp: twentyMinutesAgo, endTimestamp: Date.now() })
      initialized.resolve()
      startedTimestamp = Date.now()
    },
    addAllInTimeRange
  }
}
