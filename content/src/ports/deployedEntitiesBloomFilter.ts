import { createJobQueue } from '@dcl/snapshots-fetcher/dist/job-queue-port'
import { IBaseComponent } from '@well-known-components/interfaces'
import * as bf from 'bloom-filters'
import future from 'fp-future'
import { EnvironmentConfig } from '../Environment'
import { runLoggingPerformance } from '../instrument'
import { streamAllEntityIds } from '../logic/database-queries/deployments-queries'
import { AppComponents } from '../types'

export type DeployedEntitiesBloomFilter = {
  add(entityId: string): void
  check(entityId: string): Promise<boolean>
}

export function createDeployedEntitiesBloomFilter(
  components: Pick<AppComponents, 'database' | 'logs' | 'clock' | 'env'>
): DeployedEntitiesBloomFilter & IBaseComponent {
  const logger = components.logs.getLogger('DeployedEntitiesBloomFilter')

  const batchSize = components.env.getConfig<number>(EnvironmentConfig.PG_STREAM_BATCH_SIZE) ?? 10_000

  const deploymentsBloomFilter = bf.BloomFilter.create(5_000_000, 0.001)

  const initialized = future<void>()

  const addToBFQueue = createJobQueue({
    autoStart: true,
    concurrency: batchSize * 3,
    timeout: 60000
  })

  async function addFromDb() {
    const start = components.clock.now()
    logger.info(`Creating bloom filter`, {})
    let elements = 0
    for await (const row of streamAllEntityIds(components, batchSize)) {
      elements++
      await addToBFQueue.scheduleJob(async () => {
        deploymentsBloomFilter.add(row.entityId)
      })
    }
    await addToBFQueue.onIdle()
    logger.info(`Bloom filter recreated.`, {
      timeMs: components.clock.now() - start,
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
