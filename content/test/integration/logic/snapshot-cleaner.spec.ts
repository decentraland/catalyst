import { exec } from 'child_process'
import { ContentFileHash } from 'dcl-catalyst-commons'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { EnvironmentConfig } from '../../../src/Environment'
import { cleanSnapshots } from '../../../src/logic/snapshot-cleaner'
import { bufferToStream } from '../../../src/ports/contentStorage/contentStorage'
import { ServiceImpl } from '../../../src/service/ServiceImpl'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resources-path'

const promifiedExec = promisify(exec)

const tmpRootDir = mkdtempSync(path.join(os.tmpdir(), 'snapshot-cleaner-'))

loadStandaloneTestEnvironment({ [EnvironmentConfig.STORAGE_ROOT_FOLDER]: tmpRootDir })('Clean old Snapshots', (testEnv) => {
  const minimumSnapshotSizeInBytes = 50
  beforeEach(async () => {
    rmSync(tmpRootDir, { recursive: true, force: true })
    mkdirSync(tmpRootDir, { recursive: true })
  })

  testCaseWithComponents(
    testEnv,
    'should delete a modern snapshot bigger than 50 bytes',
    async (components) => {
      const modernSnapshotContent = createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)
      const bigSnapshotHash = 'modern-snapshot-hash'
      await components.storage.storeStream('modern-snapshot-hash', bufferToStream(modernSnapshotContent))
      await cleanSnapshots(components, promifiedExec, components.staticConfigs.contentStorageFolder, minimumSnapshotSizeInBytes)

      expect(await components.storage.retrieve(bigSnapshotHash)).toBeUndefined()
    }
  )

  testCaseWithComponents(
    testEnv,
    'should delete a legacy snapshot bigger than 50 bytes',
    async (components) => {
    const legacySnapshotContent = createLegacySnapshotContentBiggerThan(50)
    const bigSnapshotHash = 'legacy-snapshot-hash'
    await components.storage.storeStream(bigSnapshotHash, bufferToStream(legacySnapshotContent))

    await cleanSnapshots(components, promifiedExec, components.staticConfigs.contentStorageFolder, minimumSnapshotSizeInBytes)

    expect(await components.storage.retrieve(bigSnapshotHash)).toBeUndefined()
    }
  )

  testCaseWithComponents(
    testEnv,
    'should delete only the modern snapshot bigger from the two files bigger than 50 bytes',
    async (components) => {
      const bigSnapshotHash = 'modern-snapshot-hash'
      const bigNotSnapshotHash = 'big-not-snapshot-hash'
      await components.storage.storeStream(bigSnapshotHash, bufferToStream(createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)))
      await components.storage.storeStream(bigNotSnapshotHash, bufferToStream(createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes)))

      await cleanSnapshots(components, promifiedExec, components.staticConfigs.contentStorageFolder, minimumSnapshotSizeInBytes)

      expect(await components.storage.retrieve(bigSnapshotHash)).toBeUndefined()
      expect(await components.storage.retrieve(bigNotSnapshotHash)).not.toBeUndefined()
    }
  )

  testCaseWithComponents(
    testEnv,
    'should delete only modern and legacy snapshots and not other files',
    async (components) => {
      const bigLegacySnapshotHash = 'legacy-snapshot-hash'
      const bigModernSnapshotHash = 'modern-snapshot-hash'
      const bigNotSnapshotHash = 'big-not-snapshot-hash'
      await components.storage.storeStream(bigLegacySnapshotHash, bufferToStream(createModernSnapshotContentWithSize(minimumSnapshotSizeInBytes)))
      await components.storage.storeStream(bigModernSnapshotHash, bufferToStream(createLegacySnapshotContentBiggerThan(minimumSnapshotSizeInBytes)))
      await components.storage.storeStream(bigNotSnapshotHash, bufferToStream(createNonSnapshotContentWithSize(minimumSnapshotSizeInBytes)))

      await cleanSnapshots(components, promifiedExec, components.staticConfigs.contentStorageFolder, minimumSnapshotSizeInBytes)

      expect(await components.storage.retrieve(bigModernSnapshotHash)).toBeUndefined()
      expect(await components.storage.retrieve(bigLegacySnapshotHash)).toBeUndefined()
      expect(await components.storage.retrieve(bigNotSnapshotHash)).not.toBeUndefined()
    }
  )

  testCaseWithComponents(
    testEnv,
    'should uncompress a big gzip snapshot file, then delete the gzip and uncompressed files',
    async (components) => {
      const bigModernSnapshotHash = 'modern-snapshot-hash'
      await components.storage.storeStreamAndCompress(bigModernSnapshotHash, bufferToStream(createModernSnapshotContentWithSize(5000)))
      const contentFolder = components.staticConfigs.contentStorageFolder

      await cleanSnapshots(components, promifiedExec, contentFolder, minimumSnapshotSizeInBytes)

      expect(await components.storage.retrieve(bigModernSnapshotHash)).toBeUndefined()
      const fds = await components.fs.readdir(contentFolder)
      console.log(`fds: ${fds}`)
      expect(fds.length).toBe(2)
      expect(fds.includes('_tmp')).toBeTruthy()
      const hashDir = fds[0] === '_tmp' ? fds[1] : fds[0]
      const dirStats = await components.fs.stat(path.resolve(contentFolder, hashDir))
      expect(dirStats.isDirectory).toBeTruthy()
      const files = await components.fs.readdir(path.resolve(contentFolder, hashDir))
      expect(files.length).toBe(0)
    }
  )

  it('should skip to process big files that has a used hash in the contents table (even if its content starts with a snapshot header)', async () => {
    const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
    const components = server.components
    makeNoopValidator(components)
    await server.startProgram()
    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata',
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    await server.deploy(deployResult.deployData)

    const contentHashes: Map<ContentFileHash, Uint8Array> = await ServiceImpl.hashFiles(deployResult.deployData.files, deployResult.deployData.entityId)
    const usedContentHashes = Array.from(contentHashes.keys())

    const bigModernSnapshotHash = 'modern-snapshot-hash'
    await components.storage.storeStreamAndCompress(bigModernSnapshotHash, bufferToStream(createModernSnapshotContentWithSize(5000)))

    const contentFolder = server.components.staticConfigs.contentStorageFolder

    await cleanSnapshots(components, promifiedExec, contentFolder, minimumSnapshotSizeInBytes)

    expect(await components.storage.retrieve(bigModernSnapshotHash)).toBeUndefined()
    for (const usedHash of usedContentHashes) {
      expect(await components.storage.retrieve(usedHash)).toBeDefined()
    }
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
