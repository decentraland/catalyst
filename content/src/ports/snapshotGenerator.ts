import { IBaseComponent } from '@well-known-components/interfaces'
import ms from 'ms'
import {
  deleteSnapshots,
  findSnapshotsStrictlyContainedInTimeRange,
  saveSnapshot
} from '../logic/database-queries/snapshots-queries'
import { ALL_ENTITIES, generateSnapshots, NewSnapshotMetadata } from '../logic/snapshots'
import { divideTimeRange, isTimeRangeCoveredBy, TimeRange } from '../logic/time-range'
import { AppComponents } from '../types'

export type SnapshotGenerator = IBaseComponent & {
  getCurrentSnapshots(): NewSnapshotMetadata[] | undefined
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
    const timeline: TimeRange = {
      initTimestampSecs: fromTimestampSecs,
      endTimestampSecs: Math.floor(Date.now() / 1000)
    }
    const timeRangeDivision = divideTimeRange(timeline)
    for (const interval of timeRangeDivision.intervals) {
      const allEntitiesSnapshots = await findSnapshotsStrictlyContainedInTimeRange(components, interval)

      const isTimeRangeCoveredByOtherSnapshots = isTimeRangeCoveredBy(
        interval,
        allEntitiesSnapshots.map((s) => s.timerange)
      )
      const multipleSnapshotsShouldBeReplaced = isTimeRangeCoveredByOtherSnapshots && allEntitiesSnapshots.length > 1
      const shouldGenerateNewSnapshot = !isTimeRangeCoveredByOtherSnapshots || multipleSnapshotsShouldBeReplaced

      if (shouldGenerateNewSnapshot) {
        const snapshotHashes = await generateSnapshots(components, interval, new Set([ALL_ENTITIES]))
        const allEntitiesGenerationResult = snapshotHashes.get(ALL_ENTITIES)
        if (allEntitiesGenerationResult) {
          const { hash, numberOfEntities } = allEntitiesGenerationResult
          const replacedSnapshotHashes = allEntitiesSnapshots.map((s) => s.hash)
          await components.database.transaction(async (txDatabase) => {
            if (replacedSnapshotHashes.length > 0) {
              await deleteSnapshots(txDatabase, replacedSnapshotHashes)
              // DELETE snapshot files!!!
            }
            const newSnapshot = { hash, timerange: interval, replacedSnapshotHashes, numberOfEntities }
            await saveSnapshot(txDatabase, newSnapshot, Math.floor(Date.now() / 1000))
            snapshotMetadatas.push(newSnapshot)
          })
        } else {
          throw new Error('Error generating snapshot')
        }
        logger.info(`New snapshot generated for interval: [${interval}].`)
      } else {
        for (const snapshotMetadata of allEntitiesSnapshots) {
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
        isStopped = true
        clearTimeout(nextGenerationTimeout)
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
