import { hashV1 } from '@dcl/hashing'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createContentFileWriter, IFile } from '../ports/fileWriter'
import { AppComponents } from '../types'
import { streamActiveDeploymentsInTimeRange } from './database-queries/snapshots-queries'
import { TimeRange } from './time-range'

async function moveSnapshotFileToContentFolder(
  components: Pick<AppComponents, 'storage' | 'fs'>,
  tmpFile: string,
  hash: string,
  timeRange: TimeRange,
  logger: ILoggerComponent.ILogger
) {
  const hasContent = await components.storage.retrieve(hash)

  if (!hasContent) {
    // move and compress the file into the destinationFilename
    await components.storage.storeStreamAndCompress(hash, components.fs.createReadStream(tmpFile))
    logger.info(
      `Generated snapshot. hash=${hash} timeRange=[${timeRange.initTimestampSecs}, ${timeRange.endTimestampSecs}]`
    )
  }
}

export async function generateAndStoreSnapshot(
  components: Pick<AppComponents, 'database' | 'fs' | 'metrics' | 'storage' | 'logs' | 'denylist' | 'staticConfigs'>,
  timeRange: TimeRange
): Promise<{
  hash: string
  numberOfEntities: number
}> {
  const logger = components.logs.getLogger('snapshot-generation')
  let numberOfEntities = 0
  let fileWriter: IFile | undefined
  try {
    // chose a temp name file or let the file writer do it
    fileWriter = await createContentFileWriter(components, 'tmp-all-entities-snapshot')
    // this header is necessary to later differentiate between binary formats and non-binary formats
    await fileWriter.appendDebounced('### Decentraland json snapshot\n')
    for await (const snapshotElem of streamActiveDeploymentsInTimeRange(components, timeRange)) {
      if (components.denylist.isDenylisted(snapshotElem.entityId)) {
        continue
      }
      const stringifiedElement = JSON.stringify(snapshotElem) + '\n'
      await fileWriter.appendDebounced(stringifiedElement)
      numberOfEntities++
    }
  } finally {
    if (fileWriter) await fileWriter.close()
  }

  // Phase 3) hash generated files and move them to content folder
  const hash = await hashV1(components.fs.createReadStream(fileWriter.filePath) as any)
  await moveSnapshotFileToContentFolder(components, fileWriter.filePath, hash, timeRange, logger)
  await fileWriter.delete()
  return {
    hash,
    numberOfEntities
  }
}
