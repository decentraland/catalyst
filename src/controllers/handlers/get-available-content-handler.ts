import { AvailableContent } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'
import { InvalidRequestError } from '../errors'

// Upper bound on the number of `cid`s accepted in a single request. `existMultiple` issues one
// storage existence check (S3 HEAD / fs stat) per cid, so an uncapped list lets one unauthenticated
// request fan out into thousands of concurrent backend ops. Matches the 1000-item cap on
// POST /entities/active (issue #1935).
const MAX_AVAILABLE_CONTENT_CIDS = 1000

// Cap how many existence checks run concurrently so even a full request can't issue
// MAX_AVAILABLE_CONTENT_CIDS backend ops at once.
const CONTENT_EXISTENCE_CHECK_CONCURRENCY = 100

// Method: GET
// Query String: ?cid={hashId1}&cid={hashId2}
export async function getAvailableContentHandler(
  context: HandlerContextWithPath<'denylist' | 'storage' | 'queryParams', '/available-content'>
): Promise<{ status: 200; body: AvailableContent }> {
  const { storage, denylist, queryParams } = context.components
  const parsedParams = queryParams.qsParser(context.url.searchParams)
  const cids: string[] = queryParams.qsGetArray(parsedParams, 'cid')

  if (cids.length === 0) {
    throw new InvalidRequestError('Please set at least one cid.')
  }
  if (cids.length > MAX_AVAILABLE_CONTENT_CIDS) {
    throw new InvalidRequestError(`Too many cids requested; the maximum allowed is ${MAX_AVAILABLE_CONTENT_CIDS}.`)
  }
  const availableCids = cids.filter((cid) => !denylist.isDenylisted(cid))

  // Check existence in fixed-size chunks to bound peak concurrency against the storage backend.
  const availableContent = new Map<string, boolean>()
  for (let i = 0; i < availableCids.length; i += CONTENT_EXISTENCE_CHECK_CONCURRENCY) {
    const chunk = availableCids.slice(i, i + CONTENT_EXISTENCE_CHECK_CONCURRENCY)
    for (const [cid, isAvailable] of await storage.existMultiple(chunk)) {
      availableContent.set(cid, isAvailable)
    }
  }

  return {
    status: 200,
    body: Array.from(availableContent.entries()).map(([fileHash, isAvailable]) => ({
      cid: fileHash,
      available: isAvailable
    }))
  }
}
