import { createLogComponent } from '@well-known-components/logger'
import { exec } from 'child_process'
import { mkdtempSync } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { bufferToStream, ContentStorage } from '../../src/ports/contentStorage/contentStorage'
import { createFileSystemContentStorage } from '../../src/ports/contentStorage/fileSystemContentStorage'
import { createFsComponent } from '../../src/ports/fs'
import { createGzipCompressor } from '../../src/ports/gzipCompressor'
import { cleanSnapshots } from '../../src/snapshotCleaner'
const promifiedExec = promisify(exec)

describe('clean snapshots', () => {
  const logs = createLogComponent()
  const fs = createFsComponent()
  const gzipCompressor = createGzipCompressor({ fs, logs })
  let tmpRootDir: string
  let contentStorage: ContentStorage
  beforeEach(async () => {
    tmpRootDir = mkdtempSync(path.join(os.tmpdir(), 'snapshot-cleaner-'))
    contentStorage = await createFileSystemContentStorage({ fs }, tmpRootDir)
  })

  it('should delete a modern snapshot bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const modernSnapshotContent = createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)
    const bigSnapshotHash = 'modern-snapshot-hash'
    await contentStorage.storeStream('modern-snapshot-hash', bufferToStream(modernSnapshotContent))

    await cleanSnapshots(promifiedExec, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(await contentStorage.retrieve(bigSnapshotHash)).toBeUndefined()
  })

  it('should delete a legacy snapshot bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const legacySnapshotContent = createLegacySnapshotContentBiggerThan(50)
    const bigSnapshotHash = 'legacy-snapshot-hash'
    await contentStorage.storeStream(bigSnapshotHash, bufferToStream(legacySnapshotContent))

    await cleanSnapshots(promifiedExec, { fs, logs, gzipCompressor } , tmpRootDir, minimumSnapshotSizeInBytes)

    expect(await contentStorage.retrieve(bigSnapshotHash)).toBeUndefined()
  })

  it('should delete only the modern snapshot bigger from the two files bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigSnapshotHash = 'modern-snapshot-hash'
    const bigNotSnapshotHash = 'big-not-snapshot-hash'
    await contentStorage.storeStream(bigSnapshotHash, bufferToStream(createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)))
    await contentStorage.storeStream(bigNotSnapshotHash, bufferToStream(createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes)))

    await cleanSnapshots(promifiedExec, { fs, logs, gzipCompressor } , tmpRootDir, minimumSnapshotSizeInBytes)

    expect(await contentStorage.retrieve(bigSnapshotHash)).toBeUndefined()
    expect(await contentStorage.retrieve(bigNotSnapshotHash)).not.toBeUndefined()
  })

  it('should delete only modern and legacy snapshots and not other files', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigLegacySnapshotHash = 'legacy-snapshot-hash'
    const bigModernSnapshotHash = 'modern-snapshot-hash'
    const bigNotSnapshotHash = 'big-not-snapshot-hash'
    await contentStorage.storeStream(bigLegacySnapshotHash, bufferToStream(createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)))
    await contentStorage.storeStream(bigModernSnapshotHash, bufferToStream(createLegacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)))
    await contentStorage.storeStream(bigNotSnapshotHash, bufferToStream(createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes)))

    await cleanSnapshots(promifiedExec, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(await contentStorage.retrieve(bigModernSnapshotHash)).toBeUndefined()
    expect(await contentStorage.retrieve(bigLegacySnapshotHash)).toBeUndefined()
    expect(await contentStorage.retrieve(bigNotSnapshotHash)).not.toBeUndefined()
  })

  it('should uncompress a big gzip snapshot file, then delete the gzip and uncompressed files', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigModernSnapshotHash = 'modern-snapshot-hash'
    await contentStorage.storeStreamAndCompress(bigModernSnapshotHash, bufferToStream(createModernSnapshotContentWithSize(5000)))

    await cleanSnapshots(promifiedExec, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(await contentStorage.retrieve(bigModernSnapshotHash)).toBeUndefined()
    const fds = await fs.readdir(tmpRootDir)
    expect(fds.length).toBe(1)
    const dirStats = await fs.stat(path.resolve(tmpRootDir, fds[0]))
    expect(dirStats.isDirectory).toBeTruthy()
    const files = await fs.readdir(path.resolve(tmpRootDir, fds[0]))
    expect(files.length).toBe(0)
  })

  it('should uncompress a big gzip non-snapshot file, then delete uncompressed file but not the gzip one', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigNonSnapshotHash = 'modern-snapshot-hash'
    await contentStorage.storeStreamAndCompress(bigNonSnapshotHash, bufferToStream(createNonSnapshotContentWithSize(5000)))

    await cleanSnapshots(promifiedExec, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    const contentItem = await contentStorage.retrieve(bigNonSnapshotHash)
    expect(contentItem).toBeDefined()
    expect((await contentItem.asRawStream()).encoding).toEqual('gzip')
    const fds = await fs.readdir(tmpRootDir)
    expect(fds.length).toBe(1)
    const dirStats = await fs.stat(path.resolve(tmpRootDir, fds[0]))
    expect(dirStats.isDirectory).toBeTruthy()
    const files = await fs.readdir(path.resolve(tmpRootDir, fds[0]))
    expect(files.length).toBe(1)
    expect(files[0]).toBe(bigNonSnapshotHash + '.gzip')
  })

  it('auxiliar test - should create snapshot content with specified size', () => {
    const minimumSnapshotSizeInBytes = 50
    const modernSnapshotContent = createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)
    const legacySnapshotContent = createLegacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)
    expect(modernSnapshotContent.length).toBe(minimumSnapshotSizeInBytes)
    expect(legacySnapshotContent.length >= minimumSnapshotSizeInBytes).toBeTruthy()
  })
})

function createModernSnapshotContentWithSize(snapshotSizeInBytes: number): Buffer {
  const header = '### Decentraland json snapshot\n'
  if (snapshotSizeInBytes < header.length) {
    throw new Error('bad input')
  }
  const numberOfCharactersMissing = snapshotSizeInBytes - header.length
  return Buffer.from('### Decentraland json snapshot\n' + 'a'.repeat(numberOfCharactersMissing))
}

function createLegacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes: number): Buffer {
  const anElement = '["QmbG1pfz6Lsk9BAcTXvPXLTVd4XAzvbMG61o7h5KPVzqSb",["0xd65a0a2d8770f7876567a3470274d6e3f3cf5e1f"]]'
  const numberOfElements = Math.ceil(minimumSnapshotSizeInBytes / anElement.length)
  const elements = Array(numberOfElements).fill(anElement)
  return Buffer.from(`[${elements.join(',')}]`)
}

function createNonSnapshotContentWithSize(nonSnapshotSizeInBytes: number): Buffer {
  return Buffer.from('a'.repeat(nonSnapshotSizeInBytes))
}
