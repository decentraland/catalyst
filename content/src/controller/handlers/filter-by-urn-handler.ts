import { DecentralandAssetIdentifier, parseUrn } from '@dcl/urn-resolver'
import { paginationObject } from '../utils'
import { HandlerContextWithPath, InvalidRequestError } from '../../types'
import { BASE_AVATARS_COLLECTION_ID, BASE_EMOTES_COLLECTION_ID } from '../../ports/activeEntities'
import { GetEntitiesByPointerPrefix200 } from '@dcl/catalyst-api-specs/lib/client'

async function isUrnPrefixValid(collectionUrn: string): Promise<string | false> {
  const startTime = performance.now()
  console.log('[PERF] isUrnPrefixValid START', { collectionUrn })

  const regex = /^[a-zA-Z0-9_.:,-]+$/g
  if (!regex.test(collectionUrn)) {
    const duration = performance.now() - startTime
    console.log('[PERF] isUrnPrefixValid END - Invalid regex', { collectionUrn, duration: `${duration.toFixed(2)}ms` })
    return false
  }
  if (collectionUrn === BASE_AVATARS_COLLECTION_ID || collectionUrn === BASE_EMOTES_COLLECTION_ID) {
    const duration = performance.now() - startTime
    console.log('[PERF] isUrnPrefixValid END - Base collection', {
      collectionUrn,
      duration: `${duration.toFixed(2)}ms`
    })
    return collectionUrn
  }

  try {
    const parseStartTime = performance.now()
    const parsedUrn: DecentralandAssetIdentifier | null = await parseUrn(collectionUrn)
    const parseDuration = performance.now() - parseStartTime
    console.log('[PERF] parseUrn completed', { duration: `${parseDuration.toFixed(2)}ms`, parsedUrn })

    if (!parsedUrn) {
      const duration = performance.now() - startTime
      console.log('[PERF] isUrnPrefixValid END - No parsed URN', {
        collectionUrn,
        duration: `${duration.toFixed(2)}ms`
      })
      return false
    }

    // We want to reduce the matches of the query,
    // so we enforce to write the full name of the third party or collection for the search
    if (
      parsedUrn.type === 'blockchain-collection-third-party-name' ||
      parsedUrn.type === 'blockchain-collection-third-party-collection'
    ) {
      const result = `${collectionUrn}:`
      const duration = performance.now() - startTime
      console.log('[PERF] isUrnPrefixValid END - Third party with colon', {
        collectionUrn,
        result,
        parsedUrnType: parsedUrn.type,
        duration: `${duration.toFixed(2)}ms`
      })
      return result
    }

    if (
      parsedUrn.type === 'blockchain-collection-third-party' ||
      parsedUrn.type === 'blockchain-collection-v1' ||
      parsedUrn.type === 'blockchain-collection-v2' ||
      parsedUrn.type === 'blockchain-collection-v1-asset' ||
      parsedUrn.type === 'blockchain-collection-v2-asset'
    ) {
      const duration = performance.now() - startTime
      console.log('[PERF] isUrnPrefixValid END - Valid URN type', {
        collectionUrn,
        parsedUrnType: parsedUrn.type,
        duration: `${duration.toFixed(2)}ms`
      })
      return collectionUrn
    }
  } catch (error) {
    console.error('[ERROR] isUrnPrefixValid failed', { collectionUrn, error })
  }
  const duration = performance.now() - startTime
  console.log('[PERF] isUrnPrefixValid END - No match', { collectionUrn, duration: `${duration.toFixed(2)}ms` })
  return false
}

// Method: GET
export async function getEntitiesByPointerPrefixHandler(
  context: HandlerContextWithPath<'database' | 'activeEntities', '/entities/active/collections/:collectionUrn'>
): Promise<{ status: 200; body: GetEntitiesByPointerPrefix200 }> {
  const handlerStartTime = performance.now()
  const collectionUrn: string = context.params.collectionUrn
  console.log('[PERF] ========================================')
  console.log('[PERF] getEntitiesByPointerPrefixHandler START', {
    collectionUrn,
    url: context.url.toString()
  })

  const urnValidationStartTime = performance.now()
  const parsedUrn = await isUrnPrefixValid(collectionUrn)
  const urnValidationDuration = performance.now() - urnValidationStartTime
  console.log('[PERF] URN validation completed', {
    duration: `${urnValidationDuration.toFixed(2)}ms`,
    parsedUrn
  })

  if (!parsedUrn) {
    const handlerDuration = performance.now() - handlerStartTime
    console.log('[PERF] getEntitiesByPointerPrefixHandler END - Invalid URN', {
      collectionUrn,
      duration: `${handlerDuration.toFixed(2)}ms`
    })
    console.log('[PERF] ========================================')
    throw new InvalidRequestError(
      `Invalid collection urn param, it must be a valid urn prefix of a collection or an item in the collection or base wearables, instead: '${collectionUrn}'`
    )
  }

  const paginationStartTime = performance.now()
  const pagination = paginationObject(context.url)
  const paginationDuration = performance.now() - paginationStartTime
  console.log('[PERF] Pagination parsed', {
    pagination,
    duration: `${paginationDuration.toFixed(2)}ms`
  })

  const withPrefixStartTime = performance.now()
  const { total, entities } = await context.components.activeEntities.withPrefix(
    context.components.database,
    parsedUrn,
    pagination.offset,
    pagination.limit
  )
  const withPrefixDuration = performance.now() - withPrefixStartTime
  console.log('[PERF] activeEntities.withPrefix completed', {
    duration: `${withPrefixDuration.toFixed(2)}ms`,
    total,
    entitiesCount: entities.length
  })

  const handlerDuration = performance.now() - handlerStartTime
  console.log('[PERF] getEntitiesByPointerPrefixHandler END', {
    totalDuration: `${handlerDuration.toFixed(2)}ms`,
    breakdown: {
      urnValidation: `${urnValidationDuration.toFixed(2)}ms`,
      pagination: `${paginationDuration.toFixed(2)}ms`,
      withPrefix: `${withPrefixDuration.toFixed(2)}ms`
    },
    result: {
      total,
      entitiesReturned: entities.length
    }
  })
  console.log('[PERF] ========================================')

  return {
    status: 200,
    body: {
      total,
      entities
    }
  }
}
