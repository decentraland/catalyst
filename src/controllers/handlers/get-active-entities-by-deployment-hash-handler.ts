import { HandlerContextWithPath } from '../../types'
import { NotFoundError } from '../errors'

// TODO: it's a bit annoying but our current openapi->ts generation tool doesn't generate a type for string[]

// Method: GET
export async function getActiveEntityIdsByDeploymentHashHandler(
  context: HandlerContextWithPath<
    'database' | 'denylist' | 'deploymentsRepository',
    '/contents/:hashId/active-entities'
  >
): Promise<{ status: 200; body: string[] }> {
  const hashId = context.params.hashId

  let result = await context.components.deploymentsRepository.getActiveDeploymentsByContentHash(
    context.components.database,
    hashId
  )
  result = result.filter((entityId) => !context.components.denylist.isDenylisted(entityId))

  if (result.length === 0) {
    throw new NotFoundError('The entity was not found')
  }

  return {
    status: 200,
    body: result
  }
}
