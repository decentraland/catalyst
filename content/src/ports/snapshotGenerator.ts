import { createJobComponent } from '@dcl/job-component'
import { SnapshotMetadata } from '@dcl/snapshots-fetcher/dist/types'
import { IBaseComponent, START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import ms from 'ms'
import { generateSnapshotsInMultipleTimeRanges } from '../logic/snapshots'
import { AppComponents } from '../types'

export type SnapshotGenerator = IBaseComponent & {
  getCurrentSnapshots(): SnapshotMetadata[] | undefined
}

export function createSnapshotGenerator(
  components: Pick<
    AppComponents,
    'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs' | 'clock'
  >
): SnapshotGenerator {
  const logger = components.logs.getLogger('snapshot-generator')
  const generationInterval = ms('6h')
  let currentSnapshots: SnapshotMetadata[] | undefined

  const job = createJobComponent(
    { logs: components.logs },
    async () => {
      currentSnapshots = await generateSnapshotsInMultipleTimeRanges(components, {
        // IT IS IMPORTANT THIS TIMESTAMP NEVER CHANGES; IF IT DOES, THE WHOLE SNAPSHOTS SET WILL BE REGENERATED.
        initTimestamp: 1577836800000,
        endTimestamp: components.clock.now()
      })
    },
    generationInterval,
    {
      startupDelay: 0,
      onError: (error: any) => {
        logger.error(`Failed generating snapshots`)
        logger.error(error)
      }
    }
  )

  return {
    async start() {
      await job[START_COMPONENT]?.(undefined as any)
    },
    async stop() {
      await job[STOP_COMPONENT]?.()
    },
    getCurrentSnapshots(): SnapshotMetadata[] | undefined {
      return currentSnapshots
    }
  }
}
