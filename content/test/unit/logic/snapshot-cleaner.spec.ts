import { createLogComponent } from '@well-known-components/logger'
import path from 'path'
import sinon from 'sinon'
import { cleanSnapshots } from '../../../src/logic/snapshot-cleaner'
import * as ct from '../../../src/ports/contentStorage/contentStorage'
import { FileCompressor } from '../../../src/ports/gzipCompressor'
import { createTestDatabaseComponent } from '../../../src/ports/postgres'

const streamToBufferStub = sinon.stub(ct, 'streamToBuffer')
describe('clean snapshots', () => {
  const tmpRootDir = path.resolve('some-tmp-dir')
  const logs = createLogComponent()
  const gzipCompressor: FileCompressor = {
    compress: jest.fn(),
    decompress: jest.fn()
  }
  const database = createTestDatabaseComponent()
  database.queryWithValues = jest.fn().mockResolvedValue({ rows: [] })

  beforeEach(() => streamToBufferStub.reset())

  it('should delete a modern snapshot bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigSnapshotFilepath = 'modern-snapshot.txt'
    const filepathToContent = new Map([
      [bigSnapshotFilepath, modernSnapshotContentWithSize(minimumSnapshotSizeInBytes)]
    ])
    // To do: return also mocks ?
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots({ fs, logs, gzipCompressor, database }, executeCommandMock, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(fs.unlink).toBeCalledWith(bigSnapshotFilepath)
    expect(fs.createReadStream).toBeCalledWith(bigSnapshotFilepath, { end: 59 })
    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
  })

  it('should delete a legacy snapshot bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigSnapshotFilepath = 'legacy-snapshot.txt'

    const filepathToContent = new Map([
      [bigSnapshotFilepath, legacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)]
    ])
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots({ fs, logs, gzipCompressor, database }, executeCommandMock, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(fs.createReadStream).toBeCalledWith(bigSnapshotFilepath, { end: 59 })
    expect(fs.unlink).toBeCalledWith(bigSnapshotFilepath)
  })
  it('should delete only the modern snapshot bigger from the two files bigger than 50 bytes', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigSnapshotFilepath = 'modern-snapshot.txt'
    const bigNotSnapshotFilepath = 'big-not-snapshot.txt'
    const filepathToContent = new Map([
      [bigSnapshotFilepath, modernSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
      [bigNotSnapshotFilepath, nonSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
    ])
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots({ fs, logs, gzipCompressor, database }, executeCommandMock, tmpRootDir, minimumSnapshotSizeInBytes)

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
      [bigModernSnapshotFilepath, modernSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
      [bigLegacySnapshotFilepath, legacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)],
      [bigNotSnapshotFilepath, nonSnapshotContentWithSize(minimumSnapshotSizeInBytes)]
    ])
    const fs = createFsMockWithFiles(filepathToContent)
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)


    await cleanSnapshots({ fs, logs, gzipCompressor, database }, executeCommandMock, tmpRootDir, minimumSnapshotSizeInBytes)
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
      [bigModernSnapshotGzipFilepath, nonSnapshotContentWithSize(minimumSnapshotSizeInBytes)]
    ])
    const fs = createFsMock()
    fs.addFile(bigModernSnapshotFilepath, modernSnapshotContentWithSize(minimumSnapshotSizeInBytes))
    const gzipCompressor: FileCompressor = {
      compress: jest.fn(),
      decompress: jest.fn()
    }
    const decompressStub = sinon.stub(gzipCompressor, 'decompress')
      .withArgs(sinon.match(bigModernSnapshotGzipFilepath), sinon.match(bigModernSnapshotFilepath))
      .callsFake((source, dest) => {
        fs.addFile(dest, modernSnapshotContentWithSize(minimumSnapshotSizeInBytes))
        return Promise.resolve(true)
    })
    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots({ fs, logs, gzipCompressor, database }, executeCommandMock, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    sinon.assert.calledWith(decompressStub, bigModernSnapshotGzipFilepath, bigModernSnapshotFilepath)
    expect(fs.createReadStream).toBeCalledWith(bigModernSnapshotFilepath, {'end': 59})
    expect(fs.createReadStream).not.toBeCalledWith(bigModernSnapshotGzipFilepath, {'end': 59})
    expect(fs.unlink).toBeCalledWith(bigModernSnapshotGzipFilepath)
    expect(fs.unlink).toBeCalledWith(bigModernSnapshotFilepath)
  })

  it('should uncompress a big gzip non-snapshot file, then delete uncompressed file but not the gzip one', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigNonSnapshotFilepath = 'non-snapshot-hash'
    const bigNonSnapshotGzipFilePath = bigNonSnapshotFilepath + '.gzip'

    const filepathToContent = new Map([
      [bigNonSnapshotGzipFilePath, nonSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
    ])

    const fs = createFsMock()
    fs.addFile(bigNonSnapshotGzipFilePath, nonSnapshotContentWithSize(minimumSnapshotSizeInBytes))

    const gzipCompressor: FileCompressor = {
      compress: jest.fn(),
      decompress: jest.fn()
    }
    const decompressStub = sinon.stub(gzipCompressor, 'decompress')
      .withArgs(sinon.match(bigNonSnapshotGzipFilePath), sinon.match(bigNonSnapshotFilepath))
      .callsFake((source, dest) => {
        fs.addFile(dest, nonSnapshotContentWithSize(minimumSnapshotSizeInBytes))
        return Promise.resolve(true)
    })

    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots({ fs, logs, gzipCompressor, database }, executeCommandMock, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    sinon.assert.calledWith(decompressStub, bigNonSnapshotGzipFilePath, bigNonSnapshotFilepath)
    expect(fs.createReadStream).toBeCalledWith(bigNonSnapshotFilepath, {'end': 59})
    expect(fs.unlink).toBeCalledWith(bigNonSnapshotFilepath)
    expect(fs.createReadStream).not.toBeCalledWith(bigNonSnapshotGzipFilePath, {'end': 59})
    expect(fs.unlink).not.toBeCalledWith(bigNonSnapshotGzipFilePath)
  })

  it('should skip to process big files that has a used hash in the contents table (even if its content starts with a snapshot header)', async () => {
    const minimumSnapshotSizeInBytes = 50
    const bigSnapshotFilepath = 'modern-snapshot-hash'
    const bigContentFilepath = 'a-content-file-hash'

    const filepathToContent = new Map([
      [bigSnapshotFilepath, modernSnapshotContentWithSize(minimumSnapshotSizeInBytes)],
      [bigContentFilepath, modernSnapshotContentWithSize(minimumSnapshotSizeInBytes)]
    ])

    const fs = createFsMockWithFiles(filepathToContent)

    database.queryWithValues = jest.fn().mockResolvedValue({ rows: [{ content_hash: bigContentFilepath }] })

    const executeCommandMock = createExecuteCommandMockWithStdoutListingFiles(filepathToContent)

    await cleanSnapshots({ fs, logs, gzipCompressor, database }, executeCommandMock, tmpRootDir, minimumSnapshotSizeInBytes)

    expect(executeCommandMock).toBeCalledWith(`find ${tmpRootDir} -type f -size +${minimumSnapshotSizeInBytes - 1}c`)
    expect(fs.createReadStream).toBeCalledWith(bigSnapshotFilepath, {'end': 59})
    expect(fs.createReadStream).not.toBeCalledWith(bigContentFilepath, {'end': 59})
    expect(fs.unlink).toBeCalledWith(bigSnapshotFilepath)
    expect(fs.unlink).not.toBeCalledWith(bigContentFilepath)
  })

  it('auxiliar test - should create snapshot content with specified size', () => {
    const minimumSnapshotSizeInBytes = 50
    const modernSnapshotContent = modernSnapshotContentWithSize(minimumSnapshotSizeInBytes)
    const legacySnapshotContent = legacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)
    expect(modernSnapshotContent.length).toBe(minimumSnapshotSizeInBytes)
    expect(legacySnapshotContent.length >= minimumSnapshotSizeInBytes).toBeTruthy()
  })
})

function modernSnapshotContentWithSize(snapshotSizeInBytes: number): Buffer {
  const header = '### Decentraland json snapshot\n'
  if (snapshotSizeInBytes < header.length) {
    throw new Error('bad input')
  }
  const numberOfCharactersMissing = snapshotSizeInBytes - header.length
  return Buffer.from('### Decentraland json snapshot\n' + 'a'.repeat(numberOfCharactersMissing))
}

function legacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes: number): Buffer {
  const anElement = '["QmbG1pfz6Lsk9BAcTXvPXLTVd4XAzvbMG61o7h5KPVzqSb",["0xd65a0a2d8770f7876567a3470274d6e3f3cf5e1f"]]'
  const numberOfElements = Math.ceil(minimumSnapshotSizeInBytes / anElement.length)
  const elements = Array(numberOfElements).fill(anElement)
  return Buffer.from(`[${elements.join(',')}]`)
}

function nonSnapshotContentWithSize(nonSnapshotSizeInBytes: number): Buffer {
  return Buffer.from('a'.repeat(nonSnapshotSizeInBytes))
}

function createExecuteCommandMockWithStdoutListingFiles(files: Map<string, Buffer>) {
  return jest.fn().mockResolvedValue({
    stdout: Array.from(files.keys()).join('\n'),
    stderr: ''
  })
}

function createFsMock() {
  const filepathToReadStream = new Map()
  return {
    createReadStream: jest.fn().mockImplementation((filepath) => filepathToReadStream.get(filepath)),
    unlink: jest.fn(),
    addFile: (filepath: string, content: Buffer) => {
      const readStreamMock = { close: jest.fn() }
      filepathToReadStream.set(filepath, readStreamMock)
      streamToBufferStub.withArgs(sinon.match(readStreamMock)).resolves(content)
    }
  }
}

function createFsMockWithFiles(filepathToContent: Map<string, Buffer>) {
  const fsMock = createFsMock()
  filepathToContent.forEach((content, filepath) => {
    fsMock.addFile(filepath, content)
  })
  return fsMock
}
