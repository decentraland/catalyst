import { HandlerContextWithPath, NotFoundError } from '../../types'
import { getActiveDeploymentsByContentHash } from '../../logic/database-queries/deployments-queries'

// TODO: it's a bit annoying but our current openapi->ts generation tool doesn't generate a type for string[]

// Method: GET
export async function getActiveEntityIdsByDeploymentHashHandler(
  context: HandlerContextWithPath<'database' | 'denylist', '/contents/:hashId/active-entities'>
): Promise<{ status: 200; body: string[] }> {
  const hashId = context.params.hashId

  let result = await getActiveDeploymentsByContentHash(context.components, hashId)
  result = result.filter((entityId) => !context.components.denylist.isDenylisted(entityId))

  if (result.length === 0) {
    throw new NotFoundError('The entity was not found')
  }

  return {
    status: 200,
    body: result
  }
}
