import { createLogComponent } from '@well-known-components/logger'
import path from 'path'
import sinon from 'sinon'
import * as ct from '../../src/ports/contentStorage/contentStorage'
import { FileCompressor } from '../../src/ports/gzipCompressor'
import { cleanSnapshots } from '../../src/snapshotCleaner'

const streamToBufferStub = sinon.stub(ct, 'streamToBuffer')
describe('clean snapshots', () => {
  const tmpRootDir = path.resolve('some-tmp-dir')
  const logs = createLogComponent()
  const gzipCompressor: FileCompressor = {
    compress: jest.fn(),
    decompress: jest.fn()
  }

  beforeEach(() => streamToBufferStub.reset())

  it('should delete a modern snapshot bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigSnapshotFilepath = 'modern-snapshot.txt'
    const filepathToContent = new Map([
      [bigSnapshotFilepath, createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)]
    ])
    // To do: return also mocks
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(fs.unlink).toBeCalledWith(bigSnapshotFilepath)
    expect(fs.createReadStream).toBeCalledWith(bigSnapshotFilepath, { end: 59 })
    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
  })

  it('should delete a legacy snapshot bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigSnapshotFilepath = 'legacy-snapshot.txt'

    const filepathToContent = new Map([
      [bigSnapshotFilepath, createLegacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)]
    ])
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor } , tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(fs.createReadStream).toBeCalledWith(bigSnapshotFilepath, { end: 59 })
    expect(fs.unlink).toBeCalledWith(bigSnapshotFilepath)
  })
  it('should delete only the modern snapshot bigger from the two files bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigSnapshotFilepath = 'modern-snapshot.txt'
    const bigNotSnapshotFilepath = 'big-not-snapshot.txt'
    const filepathToContent = new Map([
      [bigSnapshotFilepath, createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
      [bigNotSnapshotFilepath, createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
    ])
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor } , tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(fs.unlink).toBeCalledWith(bigSnapshotFilepath)
    expect(fs.unlink).not.toBeCalledWith(bigNotSnapshotFilepath)
    expect(fs.createReadStream).toBeCalledWith(bigSnapshotFilepath, {'end': 59})
    expect(fs.createReadStream).toBeCalledWith(bigNotSnapshotFilepath, {'end': 59})
  })

  it('should delete only modern and legacy snapshots and not other files', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigLegacySnapshotFilepath = 'legacy-snapshot.txt'
    const bigModernSnapshotFilepath = 'modern-snapshot.txt'
    const bigNotSnapshotFilepath = 'big-not-snapshot.txt'

    const filepathToContent = new Map([
      [bigModernSnapshotFilepath, createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
      [bigLegacySnapshotFilepath, createLegacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)],
      [bigNotSnapshotFilepath, createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes)]
    ])
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)


    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)
    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(fs.createReadStream).toBeCalledWith(bigModernSnapshotFilepath, {'end': 59})
    expect(fs.createReadStream).toBeCalledWith(bigLegacySnapshotFilepath, {'end': 59})
    expect(fs.createReadStream).toBeCalledWith(bigNotSnapshotFilepath, {'end': 59})
    expect(fs.unlink).toBeCalledWith(bigModernSnapshotFilepath)
    expect(fs.unlink).toBeCalledWith(bigLegacySnapshotFilepath)
    expect(fs.unlink).not.toBeCalledWith(bigNotSnapshotFilepath)
  })

  it('should uncompress a big gzip snapshot file, then delete the gzip and uncompressed files', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigModernSnapshotFilepath = 'modern-snapshot-hash'
    const bigModernSnapshotGzipFilepath = bigModernSnapshotFilepath + '.gzip'

    const filepathToContent = new Map([
      [bigModernSnapshotFilepath, createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
      // fake the gzip content
      [bigModernSnapshotGzipFilepath, createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)]
    ])
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(gzipCompressor.decompress).toBeCalledWith(bigModernSnapshotGzipFilepath, bigModernSnapshotFilepath)
    expect(fs.createReadStream).toBeCalledWith(bigModernSnapshotFilepath, {'end': 59})
    expect(fs.createReadStream).not.toBeCalledWith(bigModernSnapshotGzipFilepath, {'end': 59})
    expect(fs.unlink).toBeCalledWith(bigModernSnapshotGzipFilepath)
    expect(fs.unlink).toBeCalledWith(bigModernSnapshotFilepath)
  })

  it('should uncompress a big gzip non-snapshot file, then delete uncompressed file but not the gzip one', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigNonSnapshotFilepath = 'modern-snapshot-hash'
    const bigNonSnapshotGzipFilePath = bigNonSnapshotFilepath + '.gzip'

    const filepathToContent = new Map([
      [bigNonSnapshotGzipFilePath, createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
      [bigNonSnapshotFilepath, createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes)]
    ])
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = jest.fn().mockResolvedValue({
      stdout: bigNonSnapshotGzipFilePath + '\n',
      stderr: ''
    })

    await cleanSnapshots(executeCommandMock, { fs, logs, gzipCompressor }, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(gzipCompressor.decompress).toBeCalledWith(bigNonSnapshotGzipFilePath, bigNonSnapshotFilepath)
    expect(fs.createReadStream).toBeCalledWith(bigNonSnapshotFilepath, {'end': 59})
    expect(fs.unlink).toBeCalledWith(bigNonSnapshotFilepath)
    expect(fs.createReadStream).not.toBeCalledWith(bigNonSnapshotGzipFilePath, {'end': 59})
    expect(fs.unlink).not.toBeCalledWith(bigNonSnapshotGzipFilePath)
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

function createExecuteCommandMockWithStdoutListingFiles(files: Map<string, any>) {
  return jest.fn().mockResolvedValue({
    stdout: Array.from(files.keys()).join('\n'),
    stderr: ''
  })
}

function createFsMockWithFiles(filepathToContent: Map<string, Buffer>) {
  const filepathToReadStream = new Map()
  filepathToContent.forEach((content, filepath) => {
    const readStreamMock = { close: jest.fn() }
    filepathToReadStream.set(filepath, readStreamMock)
    streamToBufferStub.withArgs(sinon.match(readStreamMock)).resolves(content)
  })
  return {
    createReadStream: jest.fn().mockImplementation((filepath) => filepathToReadStream.get(filepath)),
    unlink: jest.fn()
  }
}
