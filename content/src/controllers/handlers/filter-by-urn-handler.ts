import { DecentralandAssetIdentifier, parseUrn } from '@dcl/urn-resolver'
import { paginationObject } from '../utils'
import { HandlerContextWithPath, InvalidRequestError } from '../../types'
import { GetEntitiesByPointerPrefix200 } from '@dcl/catalyst-api-specs/lib/client'

// Method: GET
export async function getEntitiesByCollectionPointerPrefixHandler(
  context: HandlerContextWithPath<'activeEntities', '/entities/active/collections/:collectionUrn'>
): Promise<{ status: 200; body: GetEntitiesByPointerPrefix200 }> {
  // Collection URN or Third Party ID
  const collectionUrn: string = context.params.collectionUrn

  let parsedUrn: DecentralandAssetIdentifier | null = null

  try {
    parsedUrn = await parseUrn(collectionUrn)
  } catch (error) {
    throw new InvalidRequestError(`Invalid URN format: ${collectionUrn}`)
  }

  if (
    !parsedUrn ||
    (parsedUrn.type !== 'blockchain-collection-third-party-name' &&
      parsedUrn.type !== 'blockchain-collection-v1' &&
      parsedUrn.type !== 'blockchain-collection-v2' &&
      (parsedUrn.type !== 'off-chain' ||
        (parsedUrn.type === 'off-chain' &&
          parsedUrn.registry !== 'base-emotes' &&
          parsedUrn.registry !== 'base-avatars')))
  ) {
    throw new InvalidRequestError(
      `Invalid collection urn param, it must be a valid urn prefix of a collection or a third party id, instead: '${collectionUrn}'`
    )
  }

  const pagination = paginationObject(context.url)

  const { total, entities } = await context.components.activeEntities.withPrefix(
    collectionUrn,
    pagination.offset,
    pagination.limit
  )

  return {
    status: 200,
    body: {
      total,
      entities
    }
  }
}
