import { IBaseComponent } from '@well-known-components/interfaces'
import ms from 'ms'
import { generateSnapshotsInMultipleTimeRanges, NewSnapshotMetadata } from '../logic/snapshots'
import { AppComponents } from '../types'

export type SnapshotGenerator = IBaseComponent & {
  getCurrentSnapshots(): NewSnapshotMetadata[] | undefined
}

export function createSnapshotGenerator(
  components: Pick<
    AppComponents,
    'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs' | 'snapshotManager' | 'clock'
  >
): SnapshotGenerator {
  const logger = components.logs.getLogger('snapshot-generator')
  const generationInterval = ms('6h')
  let isRunningGeneration = false
  let isStopped = false
  let runningGeneration: Promise<void> = Promise.resolve()
  let nextGenerationTimeout: NodeJS.Timeout
  let currentSnapshots: NewSnapshotMetadata[]

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
      // We have the SnapshotManager here because we need it to run before the new snapshots run to avoid a race
      // condition with the content storage
      // await components.snapshotManager.generateSnapshots()
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
    getCurrentSnapshots(): NewSnapshotMetadata[] | undefined {
      return currentSnapshots
    }
  }
}
