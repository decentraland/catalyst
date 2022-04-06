import { createLogComponent } from '@well-known-components/logger'
import { FileHandle } from 'fs/promises'
import path from 'path'
import { FileCompressor } from '../../src/ports/gzipCompressor'
import { cleanSnapshots } from '../../src/snapshotCleaner'

describe('clean snapshots', () => {
  const tmpRootDir = path.resolve('some-tmp-dir')
  const logs = createLogComponent()
  const gzipCompressor: FileCompressor = {
    compress: jest.fn(),
    decompress: jest.fn()
  }

  it('should delete a modern snapshot bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const modernSnapshotContent = createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)
    const bigSnapshotFilepath = 'modern-snapshot.txt'
    const bigFiles = new Map([
      [bigSnapshotFilepath, createOpenFileMockWithReadResultContent(modernSnapshotContent)]
    ])
    const fs = createFsMockWithFiles(bigFiles)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(bigFiles)

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(fs.open).toBeCalledWith(bigSnapshotFilepath, fs.constants.O_RDONLY)
    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(fs.unlink).toBeCalledWith(bigSnapshotFilepath)
  })

  it('should delete a legacy snapshot bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const legacySnapshotContent = createLegacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)
    const bigSnapshotFilepath = 'legacy-snapshot.txt'
    const bigFiles = new Map([
      [bigSnapshotFilepath, createOpenFileMockWithReadResultContent(legacySnapshotContent)]
    ])
    const fs = createFsMockWithFiles(bigFiles)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(bigFiles)

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor } , tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(fs.open).toBeCalledWith(bigSnapshotFilepath, fs.constants.O_RDONLY)
    expect(fs.unlink).toBeCalledWith(bigSnapshotFilepath)
  })
  it('should delete only the modern snapshot bigger from the two files bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const modernSnapshotContent = createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)
    const bigSnapshotFilepath = 'modern-snapshot.txt'
    const bigNotSnapshotFilepath = 'big-not-snapshot.txt'
    const bigFiles = new Map([
      [bigSnapshotFilepath, createOpenFileMockWithReadResultContent(modernSnapshotContent)],
      [bigNotSnapshotFilepath, createOpenFileMockWithReadResultContent(createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes))],
    ])
    const fs = createFsMockWithFiles(bigFiles)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(bigFiles)

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor } , tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(fs.open).toBeCalledWith(bigSnapshotFilepath, fs.constants.O_RDONLY)
    expect(fs.open).toBeCalledWith(bigNotSnapshotFilepath, fs.constants.O_RDONLY)
    expect(fs.unlink).toBeCalledWith(bigSnapshotFilepath)
    expect(fs.unlink).not.toBeCalledWith(bigNotSnapshotFilepath)
  })

  it('should delete only modern and legacy snapshots and not other files', async () => {
    const minimumSnapshotSizeInBytes = 50
    const modernSnapshotContent = createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)
    const legacySnapshotContent = createLegacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)
    const bigLegacySnapshotFilepath = 'legacy-snapshot.txt'
    const bigModernSnapshotFilepath = 'modern-snapshot.txt'
    const bigNotSnapshotFilepath = 'big-not-snapshot.txt'
    const bigFiles = new Map([
      [bigModernSnapshotFilepath, createOpenFileMockWithReadResultContent(modernSnapshotContent)],
      [bigLegacySnapshotFilepath, createOpenFileMockWithReadResultContent(legacySnapshotContent)],
      [bigNotSnapshotFilepath, createOpenFileMockWithReadResultContent(createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes))],
    ])
    const fs = createFsMockWithFiles(bigFiles)

    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(bigFiles)
    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)
    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(fs.open).toBeCalledWith(bigModernSnapshotFilepath, fs.constants.O_RDONLY)
    expect(fs.open).toBeCalledWith(bigLegacySnapshotFilepath, fs.constants.O_RDONLY)
    expect(fs.open).toBeCalledWith(bigNotSnapshotFilepath, fs.constants.O_RDONLY)
    expect(fs.unlink).toBeCalledWith(bigModernSnapshotFilepath)
    expect(fs.unlink).toBeCalledWith(bigLegacySnapshotFilepath)
    expect(fs.unlink).not.toBeCalledWith(bigNotSnapshotFilepath)
  })

  it('should uncompress a big gzip snapshot file, then delete the gzip and uncompressed files', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigModernSnapshotFilepath = 'modern-snapshot-hash'
    const bigModernSnapshotGzipFilepath = bigModernSnapshotFilepath + '.gzip'
    const bigFiles = new Map([
      [bigModernSnapshotGzipFilepath, createOpenFileMockWithReadResultContent(
        createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes))],
      [bigModernSnapshotFilepath, createOpenFileMockWithReadResultContent(
        createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes))],
    ])
    const fs = createFsMockWithFiles(bigFiles)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(bigFiles)

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(gzipCompressor.decompress).toBeCalledWith(bigModernSnapshotGzipFilepath, bigModernSnapshotFilepath)
    expect(fs.open).toBeCalledWith(bigModernSnapshotFilepath, fs.constants.O_RDONLY)
    expect(fs.open).not.toBeCalledWith(bigModernSnapshotGzipFilepath, fs.constants.O_RDONLY)
    expect(fs.unlink).toBeCalledWith(bigModernSnapshotGzipFilepath)
    expect(fs.unlink).toBeCalledWith(bigModernSnapshotFilepath)
  })

  it('should uncompress a big gzip non-snapshot file, then delete uncompressed file but not the gzip one', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigNonSnapshotFilepath = 'modern-snapshot-hash'
    const bigNonSnapshotGzipFilePath = bigNonSnapshotFilepath + '.gzip'
    const bigFiles = new Map([
      [bigNonSnapshotGzipFilePath, createOpenFileMockWithReadResultContent(createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes))],
      [bigNonSnapshotFilepath, createOpenFileMockWithReadResultContent(createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes))],
    ])
    const fs = createFsMockWithFiles(bigFiles)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(bigFiles)

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(gzipCompressor.decompress).toBeCalledWith(bigNonSnapshotGzipFilePath, bigNonSnapshotFilepath)
    expect(fs.open).toBeCalledWith(bigNonSnapshotFilepath, fs.constants.O_RDONLY)
    expect(fs.unlink).not.toBeCalledWith(bigNonSnapshotGzipFilePath)
    expect(fs.unlink).toBeCalledWith(bigNonSnapshotFilepath)
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

function createExecuteCommandMockWithStdoutListingFiles(files: Map<string, FileHandle>) {
  return jest.fn().mockResolvedValue({
    stdout: Array.from(files.keys()).join('\n'),
    stderr: ''
  })
}

function createFsMockWithFiles(files: Map<string, FileHandle>) {
  return {
    open: jest.fn().mockImplementation((path) => files.get(path)),
    constants: {
      F_OK: 1,
      R_OK: 2,
      O_RDONLY: 3
    },
    unlink: jest.fn()
  }
}

function createOpenFileMockWithReadResultContent(readResultContentBuffer: Buffer): FileHandle {
  const throwNotImplemented = () => { throw new Error('Function not implemented.') }
  return {
    fd: 0,
    read: jest.fn().mockResolvedValue({
      buffer: readResultContentBuffer
    }),
    close: jest.fn(),
    appendFile: () =>  throwNotImplemented(),
    chown: () =>  throwNotImplemented(),
    chmod: () =>  throwNotImplemented(),
    datasync: () =>  throwNotImplemented(),
    sync: () =>  throwNotImplemented(),
    readFile: () =>  throwNotImplemented(),
    stat: () =>  throwNotImplemented(),
    truncate: () =>  throwNotImplemented(),
    utimes: () =>  throwNotImplemented(),
    writeFile: () =>  throwNotImplemented(),
    write: () =>  throwNotImplemented(),
    writev: () =>  throwNotImplemented(),
    readv: () =>  throwNotImplemented()
  }
}
