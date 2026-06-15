import { Erc721 } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'
import { InvalidRequestError, NotFoundError } from '../errors'
import { findEntityByPointer } from '../../logic/entities'
import { getURNProtocol } from '@dcl/schemas'

// Method: GET
export async function getERC721EntityHandler(
  context: HandlerContextWithPath<
    'entities' | 'activeEntities' | 'database' | 'denylist',
    '/entities/active/erc721/:chainId/:contract/:option/:emission?'
  >
): Promise<{ status: 200; body: Erc721 }> {
  const { database, activeEntities, entities, denylist } = context.components
  const { chainId, contract, option, emission } = context.params

  const protocol = getURNProtocol(parseInt(chainId, 10))

  if (!protocol) {
    throw new InvalidRequestError(`Invalid chainId '${chainId}'`)
  }

  const pointer = entities.buildUrn(protocol, contract, option)
  const entity = await findEntityByPointer(database, activeEntities, pointer)
  // A denylisted entity is treated as non-existent so its metadata (rarity, etc.) isn't served.
  if (!entity || denylist.isDenylisted(entity.id) || !entity.metadata) {
    throw new NotFoundError('Entity does not exist')
  }

  if (!entity.metadata.rarity) {
    throw new InvalidRequestError('Wearable is not standard.')
  }

  return {
    status: 200,
    body: entities.formatERC721Entity(pointer, entity, emission)
  }
}
