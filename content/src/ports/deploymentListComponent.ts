import { IBaseComponent } from '@well-known-components/interfaces'
import * as bf from 'bloom-filters'
import future from 'fp-future'
import { streamAllEntityIds } from '../logic/database-queries/deployments-queries'
import { AppComponents } from '../types'

export type DeploymentListComponent = {
  add(entityId: string): void
  has(entityId: string): Promise<boolean>
}

export function createDeploymentListComponent(
  components: Pick<AppComponents, 'database' | 'logs'>
): DeploymentListComponent & IBaseComponent {
  const logger = components.logs.getLogger('DeploymentListComponent')

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
    async has(entityId: string) {
      await initialized
      return deploymentsBloomFilter.has(entityId)
    },
    async start() {
      await addFromDb()
      initialized.resolve()
    }
  }
}
