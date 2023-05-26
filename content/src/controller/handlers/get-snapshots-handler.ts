import { Snapshots, Error } from '@dcl/catalyst-api-specs/lib/client'
import { HandlerContextWithPath } from '../../types'

type Response = { status: 200; body: Snapshots } | { status: 503; body: Error }

// Method: GET
export async function getSnapshotsHandler(
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
