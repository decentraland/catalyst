import { FileHandle } from 'fs/promises'
import PQueue from 'p-queue'
import path from 'path'
import { FSComponent } from './ports/fs'
import { AppComponents } from './types'

export async function cleanSnapshots(
  executeCommand: (command: string) => Promise<{ stdout: string; stderr: string }>,
  components: Pick<AppComponents, 'logs' | 'gzipCompressor'> & {
    fs: Pick<FSComponent, 'constants' | 'open' | 'unlink'>
  },
  storageDirectory: string,
  minimumSnapshotSizeInBytes: number
): Promise<void> {
  const logger = components.logs.getLogger('Snapshot Cleaner')

  const isModernSnapshotHeader = (header: string): boolean => header.startsWith('### Decentraland json snapshot')
  const isLegacySnapshotHeader = (header: string): boolean => header.match(/\[\[\"Qm.+?(?=\",\[\")/) !== null

  const isSnapshot = async (filepath: string): Promise<boolean> => {
    let openFile: FileHandle | undefined
    try {
      openFile = await components.fs.open(filepath, components.fs.constants.O_RDONLY)
      const header = await openFile.read({ length: 60 })
      const potentialSnapshotHeader = header.buffer.toString('utf8', 0, 60)
      return isModernSnapshotHeader(potentialSnapshotHeader) || isLegacySnapshotHeader(potentialSnapshotHeader)
    } finally {
      if (openFile) {
        await openFile.close()
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
        logger.debug(`deleting snapshot: ${filepath}`)
        await components.fs.unlink(filepath)
      }
      if (isCompressed) {
        await components.fs.unlink(potentialSnapshotFilepath)
      }
    } catch (error) {
      logger.error(`Error processing file: ${filepath}. Error: ${JSON.stringify(error)}`)
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
  logger.info(`Cleaning old snapshots in ${resolvedPath}...`)
  const pathsOfBigFiles = await getPathsOfBigFiles(resolvedPath)

  // Filter files that are being referenced in the DB

  logger.debug(`Big files to process: ${JSON.stringify(pathsOfBigFiles)}`)
  const queue = new PQueue({ concurrency: 2 })
  const proms = pathsOfBigFiles.map((file) => queue.add(async () => deleteIfItIsASnapshot(file)))

  await Promise.all(proms)
  logger.info('Old snapshots cleaned')
}
