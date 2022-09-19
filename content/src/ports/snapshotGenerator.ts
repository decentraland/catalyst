import { IBaseComponent } from '@well-known-components/interfaces'
import ms from 'ms'
import {
  deleteSnapshots,
  findSnapshotsStrictlyContainedInTimeRange,
  saveSnapshot
} from '../logic/database-queries/snapshots-queries'
import { generateAndStoreSnapshot } from '../logic/snapshots'
import { divideTimeRange, isTimeRangeCoveredBy, TimeRange } from '../logic/time-range'
import { AppComponents } from '../types'

export type SnapshotGenerator = IBaseComponent & {
  getCurrentSnapshots(): NewSnapshotMetadata[] | undefined
}

export type NewSnapshotMetadata = {
  hash: string
  timeRange: TimeRange
  numberOfEntities: number
  replacedSnapshotHashes?: string[]
}

export function createSnapshotGenerator(
  components: Pick<AppComponents, 'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs'>
): SnapshotGenerator {
  const logger = components.logs.getLogger('snapshot-generator')
  const generationInterval = ms('6h')
  let isRunningGeneration = false
  let isStopped = false
  let runningGeneration: Promise<void> = Promise.resolve()
  let nextGenerationTimeout: NodeJS.Timeout
  let currentSnapshots: NewSnapshotMetadata[]

  async function generateSnapshotsInMultipleTimeRanges(
    components: Pick<AppComponents, 'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs'>,
    fromTimestampSecs: number
  ): Promise<NewSnapshotMetadata[]> {
    const snapshotMetadatas: NewSnapshotMetadata[] = []
    const timeRangeDivision = divideTimeRange({
      initTimestampSecs: fromTimestampSecs,
      endTimestampSecs: Math.floor(Date.now() / 1000)
    })
    for (const timeRange of timeRangeDivision.intervals) {
      const savedSnapshots = await findSnapshotsStrictlyContainedInTimeRange(components, timeRange)

      const isTimeRangeCoveredByOtherSnapshots = isTimeRangeCoveredBy(
        timeRange,
        savedSnapshots.map((s) => s.timeRange)
      )
      const multipleSnapshotsShouldBeReplaced = isTimeRangeCoveredByOtherSnapshots && savedSnapshots.length > 1
      const shouldGenerateNewSnapshot = !isTimeRangeCoveredByOtherSnapshots || multipleSnapshotsShouldBeReplaced

      if (shouldGenerateNewSnapshot) {
        const { hash, numberOfEntities } = await generateAndStoreSnapshot(components, timeRange)
        const replacedSnapshotHashes = savedSnapshots.map((s) => s.hash)
        await components.database.transaction(async (txDatabase) => {
          if (replacedSnapshotHashes.length > 0) {
            await deleteSnapshots(txDatabase, replacedSnapshotHashes)
            await components.storage.delete(replacedSnapshotHashes)
          }
          const newSnapshot = { hash, timeRange, replacedSnapshotHashes, numberOfEntities }
          await saveSnapshot(txDatabase, newSnapshot, Math.floor(Date.now() / 1000))
          snapshotMetadatas.push(newSnapshot)
        })
        logger.info(
          `New snapshot generated for interval: [${timeRange.initTimestampSecs}, ${timeRange.endTimestampSecs}].`
        )
      } else {
        for (const snapshotMetadata of savedSnapshots) {
          snapshotMetadatas.push(snapshotMetadata)
        }
      }
    }
    return snapshotMetadatas
  }

  async function runGenerationAndScheduleNext() {
    isRunningGeneration = true
    try {
      currentSnapshots = await generateSnapshotsInMultipleTimeRanges(components, 1577836800)
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
    getCurrentSnapshots(): NewSnapshotMetadata[] | undefined {
      return currentSnapshots
    }
  }
}
