import { GetSnapshots200Item } from '@dcl/catalyst-api-specs/lib/client/client.schemas'
import { HandlerContextWithPath } from '../../types'

type Response = { status: 200; body: GetSnapshots200Item[] }

// Method: GET
export async function getAllNewSnapshots(
  context: HandlerContextWithPath<'snapshotGenerator', '/snapshots'>
): Promise<Response> {
  const metadata = context.components.snapshotGenerator.getCurrentSnapshots()
  if (!metadata) {
    return {
      status: 503,
      body: { error: 'New Snapshots not yet created' }
    }
  }

  return {
    status: 200,
    body: metadata
  }
}
