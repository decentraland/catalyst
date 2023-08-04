import { SnapshotMetadata } from '@dcl/snapshots-fetcher/dist/types'
import { IBaseComponent } from '@well-known-components/interfaces'
import ms from 'ms'
import { generateSnapshotsInMultipleTimeRanges } from '../logic/snapshots.js'
import { AppComponents } from '../types.js'

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
  let isRunningGeneration = false
  let isStopped = false
  let runningGeneration: Promise<void> = Promise.resolve()
  let nextGenerationTimeout: NodeJS.Timeout
  let currentSnapshots: SnapshotMetadata[]

  async function runGenerationAndScheduleNext() {
    isRunningGeneration = true
    try {
      currentSnapshots = await generateSnapshotsInMultipleTimeRanges(components, {
        // IT IS IMPORTANT THIS TIMESTAMP NEVER CHANGES; IF IT DOES, THE WHOLE SNAPSHOTS SET WILL BE REGENERATED.
        initTimestamp: 1577836800000,
        endTimestamp: components.clock.now()
      })
    } catch (error) {
      logger.error(`Failed generating snapshots`)
      logger.error(error)
    } finally {
      isRunningGeneration = false
      nextGenerationTimeout = setTimeout(() => runGenerationAndScheduleNext(), generationInterval)
    }
  }

  return {
    async start(): Promise<void> {
      runningGeneration = runGenerationAndScheduleNext()
      await runningGeneration
    },
    async stop(): Promise<void> {
      if (isStopped) return
      if (isRunningGeneration) {
        await runningGeneration
      }
      isStopped = true
      clearTimeout(nextGenerationTimeout)
      return Promise.resolve()
    },
    getCurrentSnapshots(): SnapshotMetadata[] | undefined {
      return currentSnapshots
    }
  }
}
