import { FailedDeployments } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'

// Method: GET
export async function getFailedDeploymentsHandler(
  context: HandlerContextWithPath<'failedDeployments', '/failed-deployments'>
): Promise<{ status: 200; body: FailedDeployments }> {
  const failedDeployments = await context.components.failedDeployments.getAllFailedDeployments()
  return {
    status: 200,
    body: failedDeployments
  }
}
