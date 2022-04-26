import { IBaseComponent } from '@well-known-components/interfaces'
import * as bf from 'bloom-filters'
import future from 'fp-future'
import { runLoggingPerformance } from '../instrument'
import { streamAllEntityIds } from '../logic/database-queries/deployments-queries'
import { AppComponents } from '../types'

export type DeployedEntitiesBloomFilter = {
  add(entityId: string): void
  check(entityId: string): Promise<boolean>
}

export function createDeployedEntitiesBloomFilter(
  components: Pick<AppComponents, 'database' | 'logs'>
): DeployedEntitiesBloomFilter & IBaseComponent {
  const logger = components.logs.getLogger('DeployedEntitiesBloomFilter')

  const deploymentsBloomFilter = bf.BloomFilter.create(5_000_000, 0.001)

  const initialized = future<void>()

  async function addFromDb() {
    const start = Date.now()
    logger.info(`Creating bloom filter`, {})
    let elements = 0
    for await (const row of streamAllEntityIds(components)) {
      elements++
      deploymentsBloomFilter.add(row.entityId)
    }
    logger.info(`Bloom filter recreated.`, {
      timeMs: Date.now() - start,
      elements,
      rate: deploymentsBloomFilter.rate()
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
      await runLoggingPerformance(logger, 'Populate Bloom Filter', async () => await addFromDb())
      initialized.resolve()
    }
  }
}
