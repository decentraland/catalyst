import { Deployment, EntityVersion, PartialDeploymentHistory } from 'dcl-catalyst-commons'
import { AppComponents } from 'src/types'
import { getContentFiles } from '../../logic/database-queries/content-files-queries'
import { getHistoricalDeployments } from '../../logic/database-queries/deployments-queries'
import { getMigrationData } from '../../logic/database-queries/migration-data-queries'
import { DeploymentOptions } from './types'

const MAX_HISTORY_LIMIT = 500

export async function getDeployments(
  components: Pick<AppComponents, 'database'>,
  options?: DeploymentOptions
): Promise<PartialDeploymentHistory<Deployment>> {
  const curatedOffset = options?.offset && options.offset >= 0 ? options.offset : 0
  const curatedLimit =
    options?.limit && options.limit > 0 && options.limit <= MAX_HISTORY_LIMIT ? options.limit : MAX_HISTORY_LIMIT

  const deploymentsWithExtra = await getHistoricalDeployments(
    components,
    curatedOffset,
    curatedLimit + 1,
    options?.filters,
    options?.sortBy,
    options?.lastId
  )

  const moreData = deploymentsWithExtra.length > curatedLimit

  const deploymentsResult = deploymentsWithExtra.slice(0, curatedLimit)
  const deploymentIds = deploymentsResult.map(({ deploymentId }) => deploymentId)
  const content = await getContentFiles(components, deploymentIds)

  // TODO [new-sync]: migrationData nolonger required
  const migrationData = await getMigrationData(components, deploymentIds)

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
