import { HandlerContextWithPath, InvalidRequestError } from '../types'
import { qsGetArray, qsParser } from '../logic/query-params'
import { GetAvailableContent200Item } from '@dcl/catalyst-api-specs/lib/client/client.schemas'

// Method: GET
// Query String: ?cid={hashId1}&cid={hashId2}
export async function getAvailableContent(
  context: HandlerContextWithPath<'denylist' | 'storage', '/available-content'>
): Promise<{ status: 200; body: GetAvailableContent200Item[] }> {
  const { storage, denylist } = context.components
  const queryParams = qsParser(context.url.searchParams)
  const cids: string[] = qsGetArray(queryParams, 'cid')

  if (cids.length === 0) {
    throw new InvalidRequestError('Please set at least one cid.')
  }
  const availableCids = cids.filter((cid) => !denylist.isDenylisted(cid))
  const availableContent = await storage.existMultiple(availableCids)

  return {
    status: 200,
    body: Array.from(availableContent.entries()).map(([fileHash, isAvailable]) => ({
      cid: fileHash,
      available: isAvailable
    }))
  }
}
