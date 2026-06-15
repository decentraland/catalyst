import { FailedDeployments } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'

// Largest page returned when the caller opts into pagination via `?offset=&limit=`.
const MAX_FAILED_DEPLOYMENTS_PAGE_SIZE = 1000

// Method: GET
// Query String (optional): ?offset={n}&limit={n}
export async function getFailedDeploymentsHandler(
  context: HandlerContextWithPath<'failedDeployments' | 'queryParams', '/failed-deployments'>
): Promise<{ status: 200; body: FailedDeployments }> {
  const { failedDeployments, queryParams } = context.components
  const parsedParams = queryParams.qsParser(context.url.searchParams)
  const offset = queryParams.qsGetNumber(parsedParams, 'offset')
  const limit = queryParams.qsGetNumber(parsedParams, 'limit')

  const allFailedDeployments = await failedDeployments.getAllFailedDeployments()

  // Backward-compatible, opt-in pagination: with neither `offset` nor `limit` we return the full
  // array exactly as before (the response type is a bare array, so a pagination envelope would break
  // the API contract). When either is provided we return a bounded slice, so an operator can page a
  // large failure set instead of pulling the entire in-memory table — which includes every auth
  // chain and internal error description — in one response.
  if (offset === undefined && limit === undefined) {
    return { status: 200, body: allFailedDeployments }
  }

  const safeOffset = offset !== undefined && offset > 0 ? offset : 0
  const safeLimit =
    limit !== undefined
      ? Math.min(Math.max(limit, 0), MAX_FAILED_DEPLOYMENTS_PAGE_SIZE)
      : MAX_FAILED_DEPLOYMENTS_PAGE_SIZE

  return {
    status: 200,
    body: allFailedDeployments.slice(safeOffset, safeOffset + safeLimit)
  }
}
