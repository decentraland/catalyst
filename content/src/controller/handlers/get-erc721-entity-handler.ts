import { Erc721 } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath, InvalidRequestError, NotFoundError } from '../../types.js'
import { buildUrn, formatERC21Entity } from '../../logic/erc721.js'
import { findEntityByPointer } from '../../logic/entities.js'
import { getURNProtocol } from '@dcl/schemas'

// Method: GET
export async function getERC721EntityHandler(
  context: HandlerContextWithPath<
    'env' | 'activeEntities' | 'database',
    '/entities/active/erc721/:chainId/:contract/:option/:emission?'
  >
): Promise<{ status: 200; body: Erc721 }> {
  const { database, activeEntities, env } = context.components
  const { chainId, contract, option, emission } = context.params

  const protocol = getURNProtocol(parseInt(chainId, 10))

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
