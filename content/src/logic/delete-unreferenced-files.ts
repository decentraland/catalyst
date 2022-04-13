import path, { basename } from 'path'
import { FSComponent } from '../ports/fs'
import { AppComponents } from '../types'
import { getContentFileHashes, getEntityFileHashes } from './database-queries/unreferenced-files-queries'

export async function deleteUnreferencedFiles(
  components: Pick<AppComponents, 'logs' | 'database'> & {
    fs: Pick<FSComponent, 'unlink' | 'stat' | 'opendir'>
  },
  folder: string
): Promise<void> {
  const logger = components.logs.getLogger('UnreferencedFilesDeleter')
  const iterateFolder = async function* (folder: string): AsyncIterable<string> {
    const dir = await components.fs.opendir(folder, { bufferSize: 4000 })
    for await (const entry of dir) {
      const resolved = path.resolve(folder, entry.name)
      if (entry.isDirectory()) {
        yield* iterateFolder(resolved)
        // } else if ((await components.fs.stat(resolved)).size > 50_000_000) {
      } else {
        yield resolved
      }
    }
  }

  const [contentFileHashes, entityFileHashes, storageFiles] = await Promise.all([
    getContentFileHashes(components),
    getEntityFileHashes(components),
    iterateFolder(folder)
  ])

  const fileHashes = new Set(contentFileHashes)
  entityFileHashes.forEach((hash) => fileHashes.add(hash))

  let numberOfDeletedFiles = 0
  const asdf: string[] = []
  for await (const storageFile of storageFiles) {
    const hash = basename(storageFile).replace(/\.gzip/, '')
    asdf.push(storageFile)
    if (!fileHashes.has(hash)) {
      console.log(`Deleting: ${storageFile}`)
      await components.fs.unlink(storageFile)
      numberOfDeletedFiles++
    }
  }
  console.log(asdf)
  // To Do: Log size released?
  logger.info(`Deleted ${numberOfDeletedFiles} files`)
}
