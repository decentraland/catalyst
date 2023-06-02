import { StatusContent } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'
import { CURRENT_COMMIT_HASH, CURRENT_CONTENT_VERSION, EnvironmentConfig } from '../../Environment'
import { statusResponseFromComponents } from '../../logic/status-checks'

export async function getStatusHandler(
  context: HandlerContextWithPath<'contentCluster' | 'synchronizationState' | 'config', '/status'>
): Promise<{ status: number; body: StatusContent }> {
  const { contentCluster, synchronizationState, config } = context.components
  const serverStatus = await statusResponseFromComponents(context.components)
  const ethNetwork = await config.requireString(EnvironmentConfig[EnvironmentConfig.ETH_NETWORK])

  return {
    status: serverStatus.successful ? 200 : 503,
    body: {
      ...serverStatus.details,
      version: CURRENT_CONTENT_VERSION,
      commitHash: CURRENT_COMMIT_HASH,
      ethNetwork,
      synchronizationStatus: {
        ...contentCluster.getStatus(),
        synchronizationState: synchronizationState.getState()
      }
    }
  }
}
