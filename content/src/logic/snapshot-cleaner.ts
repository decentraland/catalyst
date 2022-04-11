import { exec } from 'child_process'
import { ReadStream } from 'fs'
import PQueue from 'p-queue'
import path from 'path'
import { promisify } from 'util'
import { streamToBuffer } from '../ports/contentStorage/contentStorage'
import { FSComponent } from '../ports/fs'
import { AppComponents } from '../types'
import { filterContentFileHashes } from './database-queries/snapshot-cleaner-queries'

export async function cleanSnapshots(
  components: Pick<AppComponents, 'logs' | 'gzipCompressor' | 'database'> & {
    fs: Pick<FSComponent, 'unlink' | 'createReadStream'>
  },
  storageDirectory: string,
  minimumSnapshotSizeInBytes: number
): Promise<void> {
  return cleanSnapshotsWithExec(components, promisify(exec), storageDirectory, minimumSnapshotSizeInBytes)
}

// This function that takes exectueCommand that is for injecting a mock and being able to unit test.
// Didn't found a way to mock exec/promisify functions.
export async function cleanSnapshotsWithExec(
  components: Pick<AppComponents, 'logs' | 'gzipCompressor' | 'database'> & {
    fs: Pick<FSComponent, 'unlink' | 'createReadStream'>
  },
  executeCommand: (command: string) => Promise<{ stdout: string; stderr: string }>,
  storageDirectory: string,
  minimumSnapshotSizeInBytes: number
): Promise<void> {
  const logger = components.logs.getLogger('Snapshot Cleaner')

  const isModernSnapshotHeader = (header: string): boolean => header.startsWith('### Decentraland json snapshot')
  const isLegacySnapshotHeader = (header: string): boolean => header.match(/\[\[\"Qm.+?(?=\",\[\")/) !== null

  const isSnapshot = async (filepath: string): Promise<boolean> => {
    let readStream: ReadStream | undefined
    try {
      readStream = components.fs.createReadStream(filepath, { end: 59 })
      const header = await streamToBuffer(readStream)
      const potentialSnapshotHeader = header.toString('utf8')
      return isModernSnapshotHeader(potentialSnapshotHeader) || isLegacySnapshotHeader(potentialSnapshotHeader)
    } finally {
      if (readStream) {
        readStream.close()
      }
    }
  }

  const deleteIfItIsASnapshot = async (filepath: string): Promise<void> => {
    try {
      const isCompressed = filepath.endsWith('.gzip')
      const potentialSnapshotFilepath = isCompressed ? filepath.slice(0, -5) : filepath
      if (isCompressed) {
        await components.gzipCompressor.decompress(filepath, potentialSnapshotFilepath)
      }
      if (await isSnapshot(potentialSnapshotFilepath)) {
        logger.debug(`Deleting snapshot: ${filepath}`)
        await components.fs.unlink(filepath)
      }
      if (isCompressed) {
        await components.fs.unlink(potentialSnapshotFilepath)
      }
    } catch (error) {
      logger.error(error, { filepath })
    }
  }

  const getPathsOfBigFiles = async (directory: string): Promise<string[]> => {
    const { stdout, stderr } = await executeCommand(
      `find ${directory} -type f -size +${minimumSnapshotSizeInBytes - 1}c`
    )
    if (stderr) {
      throw new Error(`Error deleting old snapshots: ${stderr}`)
    }
    const relativeFilepaths = stdout ? stdout.trim().split('\n') : []
    return relativeFilepaths
  }

  const resolvedPath = path.resolve(storageDirectory)
  const pathsOfBigFiles = await getPathsOfBigFiles(resolvedPath)
  const bigFilesHashes = pathsOfBigFiles.map((filepath) => filepath.substring(filepath.lastIndexOf('/') + 1))
  const contentFileHashes = await filterContentFileHashes(components, bigFilesHashes)
  const pathsOfBigNonContentFiles = pathsOfBigFiles.filter((filepath) => {
    const hash = filepath.substring(filepath.lastIndexOf('/') + 1)
    return !contentFileHashes.includes(hash)
  })

  logger.debug(`Big files to process: ${JSON.stringify(pathsOfBigNonContentFiles)}`)
  const queue = new PQueue({ concurrency: 10 })
  const proms = pathsOfBigNonContentFiles.map((file) => queue.add(async () => deleteIfItIsASnapshot(file)))

  await Promise.all(proms)
  logger.info('Old snapshots cleaned')
}
