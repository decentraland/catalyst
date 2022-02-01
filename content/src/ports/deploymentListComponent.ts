import { IBaseComponent } from '@well-known-components/interfaces'
import future from 'fp-future'
import { streamAllEntityIds } from '../logic/database-queries/deployments-queries'
import { AppComponents } from '../types'
import { createBloomFilterComponent } from './bloomFilter'

export type DeploymentListComponent = {
  add(entityId: string): void
  check(entityId: string): Promise<boolean>
}

export function createDeploymentListComponent(
  components: Pick<AppComponents, 'database' | 'logs'>
): DeploymentListComponent & IBaseComponent {
  const bloom = createBloomFilterComponent({ sizeInBytes: 512 })

  const initialized = future<void>()

  const logs = components.logs.getLogger('DeploymentListComponent')

  async function addFromDb() {
    const start = Date.now()
    logs.info(`Creating bloom filter`, {})
    let elements = 0
    for await (const row of streamAllEntityIds(components)) {
      elements++
      bloom.add(row.entityId)
    }
    logs.info(`Bloom filter recreated.`, { timeMs: Date.now() - start, elements })
  }

  return {
    add(entityId: string) {
      bloom.add(entityId)
    },
    async check(entityId: string) {
      await initialized
      return bloom.check(entityId)
    },
    async start() {
      await addFromDb()
      initialized.resolve()
    }
  }
}
