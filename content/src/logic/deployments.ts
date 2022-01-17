import { AppComponents } from '../types'
import { deploymentExists } from './database-queries/deployments-queries'

export async function isEntityDeployed(
  components: Pick<AppComponents, 'deployedEntitiesFilter' | 'database'>,
  entityId: string
) {
  // this condition should be carefully handled:
  // 1) it first uses the bloom filter to know wheter or not an entity may exist or definitely don't exist (.check)
  // 2) then it checks against the DB (deploymentExists)
  return components.deployedEntitiesFilter.check(entityId) && (await deploymentExists(components, entityId))
}
