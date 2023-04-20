import { TimeRange } from '@dcl/snapshots-fetcher/dist/types'
import { IBaseComponent } from '@well-known-components/interfaces'
import * as bf from 'bloom-filters'
import future from 'fp-future'
import { streamAllEntityIdsInTimeRange } from '../logic/database-queries/deployments-queries'
import { AppComponents } from '../types'

export type DeployedEntitiesBloomFilter = {
  add(entityId: string): void
  check(entityId: string): Promise<boolean>
  addAllInTimeRange(timeRange: TimeRange): Promise<void>
}

export function createDeployedEntitiesBloomFilter(
  components: Pick<AppComponents, 'database' | 'logs' | 'clock'>
): DeployedEntitiesBloomFilter & IBaseComponent {
  const logger = components.logs.getLogger('deployedEntitiesBloomFilter')

  const deploymentsBloomFilter = bf.BloomFilter.create(5_000_000, 0.001)

  const initialized = future<void>()

  async function addAllInTimeRange(timeRange: TimeRange) {
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
  }

  return {
    add(entityId: string) {
      deploymentsBloomFilter.add(entityId)
    },
    async check(entityId: string) {
      await initialized
      return deploymentsBloomFilter.has(entityId)
    },
    async start() {
      const twentyMinutesAgo = components.clock.now() - 1000 * 60 * 15
      await addAllInTimeRange({ initTimestamp: twentyMinutesAgo, endTimestamp: components.clock.now() })
      initialized.resolve()
    },
    addAllInTimeRange
  }
}
