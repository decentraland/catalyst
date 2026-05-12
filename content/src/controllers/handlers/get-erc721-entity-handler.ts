import { Erc721 } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'
import { InvalidRequestError, NotFoundError } from '../errors'
import { findEntityByPointer } from '../../logic/entities'
import { getURNProtocol } from '@dcl/schemas'

// Method: GET
export async function getERC721EntityHandler(
  context: HandlerContextWithPath<
    'erc721' | 'activeEntities' | 'database',
    '/entities/active/erc721/:chainId/:contract/:option/:emission?'
  >
): Promise<{ status: 200; body: Erc721 }> {
  const { database, activeEntities, erc721 } = context.components
  const { chainId, contract, option, emission } = context.params

  const protocol = getURNProtocol(parseInt(chainId, 10))

  if (!protocol) {
    throw new InvalidRequestError(`Invalid chainId '${chainId}'`)
  }

  const pointer = erc721.buildUrn(protocol, contract, option)
  const entity = await findEntityByPointer(database, activeEntities, pointer)
  if (!entity || !entity.metadata) {
    throw new NotFoundError('Entity does not exist')
  }

  if (!entity.metadata.rarity) {
    throw new InvalidRequestError('Wearable is not standard.')
  }

  return {
    status: 200,
    body: erc721.formatERC721Entity(pointer, entity, emission)
  }
}
