import { IBaseComponent } from '@well-known-components/interfaces'
import * as bf from 'bloom-filters'
import future from 'fp-future'
import { runLoggingPerformance } from '../instrument'
import { streamAllEntityIds } from '../logic/database-queries/deployments-queries'
import { AppComponents } from '../types'

export type DeployedEntitiesFilter = {
  add(entityId: string): void
  check(entityId: string): Promise<boolean>
}

export function createDeployedEntitiesFilter(
  components: Pick<AppComponents, 'database' | 'logs'>
): DeployedEntitiesFilter & IBaseComponent {
  const logger = components.logs.getLogger('DeployedEntitiesFilter')

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
