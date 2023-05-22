import { GetStandardErc721200 } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath, InvalidRequestError, NotFoundError } from '../../types'
import { buildUrn, formatERC21Entity, getProtocol } from '../../logic/erc721'
import { findEntityByPointer } from '../../logic/entities'

// Method: GET
export async function getERC721Entity(
  context: HandlerContextWithPath<
    'env' | 'activeEntities' | 'database',
    '/entities/active/erc721/:chainId/:contract/:option/:emission?'
  >
): Promise<{ status: 200; body: GetStandardErc721200 }> {
  const { database, activeEntities, env } = context.components
  const { chainId, contract, option, emission } = context.params

  const protocol = getProtocol(parseInt(chainId, 10))

  if (!protocol) {
    throw new InvalidRequestError(`Invalid chainId '${chainId}'`)
  }

  const pointer = buildUrn(protocol, contract, option)
  const entity = await findEntityByPointer(database, activeEntities, pointer)
  if (!entity || !entity.metadata) {
    throw new NotFoundError('Entity does not exist')
  }

  if (!entity.metadata.rarity) {
    throw new Error('Wearable is not standard.')
  }

  return {
    status: 200,
    body: formatERC21Entity(env, pointer, entity, emission)
  }
}
