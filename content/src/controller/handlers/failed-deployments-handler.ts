import { GetFailedDeployments200Item } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'

// Method: GET
export async function getFailedDeployments(
  context: HandlerContextWithPath<'failedDeployments', '/failed-deployments'>
): Promise<{ status: 200; body: GetFailedDeployments200Item[] }> {
  const failedDeployments = await context.components.failedDeployments.getAllFailedDeployments()
  return {
    status: 200,
    body: failedDeployments
  }
}
