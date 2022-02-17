import { Deployment, EntityVersion, PartialDeploymentHistory } from 'dcl-catalyst-commons'
import { getContentFiles } from '../../logic/database-queries/content-files-queries'
import { getHistoricalDeployments } from '../../logic/database-queries/deployments-queries'
import { getMigrationData } from '../../logic/database-queries/migration-data-queries'
import { AppComponents } from '../../types'
import { DeploymentOptions } from './types'

export const MAX_HISTORY_LIMIT = 500

export function getCuratedOffset(options?: DeploymentOptions): number {
  return options?.offset && options.offset >= 0 ? options.offset : 0
}
export function getCuratedLimit(options?: DeploymentOptions): number {
  return options?.limit && options.limit > 0 && options.limit <= MAX_HISTORY_LIMIT ? options.limit : MAX_HISTORY_LIMIT
}

export async function getDeployments(
  components: Pick<AppComponents, 'database' | 'denylist' | 'metrics'>,
  options?: DeploymentOptions
): Promise<PartialDeploymentHistory<Deployment>> {
  const curatedOffset = getCuratedOffset(options)
  const curatedLimit = getCuratedLimit(options)

  const deploymentsWithExtra = await getHistoricalDeployments(
    components,
    curatedOffset,
    curatedLimit + 1,
    options?.filters,
    options?.sortBy,
    options?.lastId
  )

  const moreData = deploymentsWithExtra.length > curatedLimit

  let deploymentsResult = deploymentsWithExtra.slice(0, curatedLimit)

  const deploymentIds = deploymentsResult.map(({ deploymentId }) => deploymentId)

  const content = await getContentFiles(components, deploymentIds)

  // TODO [new-sync]: migrationData nolonger required
  const migrationData = await getMigrationData(components, deploymentIds)

  if (!options?.includeDenylisted) {
    deploymentsResult = deploymentsResult.filter((result) => !components.denylist.isDenyListed(result.entityId))
  }

  const deployments: Deployment[] = deploymentsResult.map((result) => ({
    entityVersion: result.version as EntityVersion,
    entityType: result.entityType,
    entityId: result.entityId,
    pointers: result.pointers,
    entityTimestamp: result.entityTimestamp,
    content: content.get(result.deploymentId),
    metadata: result.metadata,
    deployedBy: result.deployerAddress,
    auditInfo: {
      version: result.version,
      authChain: result.authChain,
      localTimestamp: result.localTimestamp,
      overwrittenBy: result.overwrittenBy,
      migrationData: migrationData.get(result.deploymentId)
    }
  }))

  return {
    deployments: deployments,
    filters: {
      ...options?.filters
    },
    pagination: {
      offset: curatedOffset,
      limit: curatedLimit,
      moreData: moreData,
      lastId: options?.lastId
    }
  }
}
