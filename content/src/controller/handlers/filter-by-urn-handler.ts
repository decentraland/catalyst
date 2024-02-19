import { DecentralandAssetIdentifier, parseUrn } from '@dcl/urn-resolver'
import { paginationObject } from '../utils'
import { HandlerContextWithPath, InvalidRequestError } from '../../types'
import { BASE_AVATARS_COLLECTION_ID, BASE_EMOTES_COLLECTION_ID } from '../../ports/activeEntities'
import { GetEntitiesByPointerPrefix200 } from '@dcl/catalyst-api-specs/lib/client'

async function isUrnPrefixValid(collectionUrn: string): Promise<string | false> {
  const regex = /^[a-zA-Z0-9_.:,-]+$/g
  if (!regex.test(collectionUrn)) return false
  if (collectionUrn === BASE_AVATARS_COLLECTION_ID || collectionUrn === BASE_EMOTES_COLLECTION_ID) {
    return collectionUrn
  }

  try {
    const parsedUrn: DecentralandAssetIdentifier | null = await parseUrn(collectionUrn)

    if (!parsedUrn) {
      return false
    }

    // We want to reduce the matches of the query,
    // so we enforce to write the full name of the third party or collection for the search
    if (
      parsedUrn.type === 'blockchain-collection-third-party-name' ||
      parsedUrn.type === 'blockchain-collection-third-party-collection'
    ) {
      return `${collectionUrn}:`
    }

    console.log(parsedUrn)
    if (
      parsedUrn.type === 'blockchain-collection-third-party' ||
      parsedUrn.type === 'blockchain-collection-v1' ||
      parsedUrn.type === 'blockchain-collection-v2' ||
      parsedUrn.type === 'blockchain-collection-v1-asset' ||
      parsedUrn.type === 'blockchain-collection-v2-asset'
    )
      return collectionUrn
  } catch (error) {
    console.error(error)
  }
  return false
}

// Method: GET
export async function getEntitiesByPointerPrefixHandler(
  context: HandlerContextWithPath<'database' | 'activeEntities', '/entities/active/collections/:collectionUrn'>
): Promise<{ status: 200; body: GetEntitiesByPointerPrefix200 }> {
  const collectionUrn: string = context.params.collectionUrn

  const parsedUrn = await isUrnPrefixValid(collectionUrn)
  if (!parsedUrn) {
    throw new InvalidRequestError(
      `Invalid collection urn param, it must be a valid urn prefix of a collection or an item in the collection or base wearables, instead: '${collectionUrn}'`
    )
  }

  const pagination = paginationObject(context.url)

  const { total, entities } = await context.components.activeEntities.withPrefix(
    context.components.database,
    parsedUrn,
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
