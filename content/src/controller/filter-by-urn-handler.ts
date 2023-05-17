import { HandlerContextWithPath, InvalidRequestError } from '../types'
import { DecentralandAssetIdentifier, parseUrn } from '@dcl/urn-resolver'
import { BASE_AVATARS_COLLECTION_ID } from '../ports/activeEntities'
import { paginationObject } from './utils'

async function isUrnPrefixValid(collectionUrn: string): Promise<string | false> {
  const regex = /^[a-zA-Z0-9_.:,-]+$/g
  if (!regex.test(collectionUrn)) return false
  if (collectionUrn === BASE_AVATARS_COLLECTION_ID) {
    return collectionUrn
  }

  try {
    const parsedUrn: DecentralandAssetIdentifier | null = await parseUrn(collectionUrn)

    if (parsedUrn === null) return false

    // We want to reduce the matches of the query,
    // so we enforce to write the full name of the third party or collection for the search
    if (
      parsedUrn?.type === 'blockchain-collection-third-party-name' ||
      parsedUrn?.type === 'blockchain-collection-third-party-collection'
    ) {
      return `${collectionUrn}:`
    }

    if (parsedUrn?.type === 'blockchain-collection-third-party') return collectionUrn
  } catch (error) {
    console.error(error)
  }
  return false
}

// Method: GET
export async function filterByUrnHandler(
  context: HandlerContextWithPath<'database' | 'activeEntities', '/entities/active/collections/:collectionUrn'>
) {
  const collectionUrn: string = context.params.collectionUrn

  const parsedUrn = await isUrnPrefixValid(collectionUrn)
  if (!parsedUrn) {
    throw new InvalidRequestError(
      `Invalid collection urn param, it should be a valid urn prefix of a 3rd party collection or base wearables, instead: '${collectionUrn}'`
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
