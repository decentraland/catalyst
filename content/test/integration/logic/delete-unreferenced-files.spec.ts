import { bufferToStream } from '@dcl/catalyst-storage/dist/content-item'
import { IBaseComponent } from '@well-known-components/interfaces'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import { EnvironmentConfig } from '../../../src/Environment'
import { deleteUnreferencedFiles } from '../../../src/logic/delete-unreferenced-files'
import { MS_PER_DAY } from '../../../src/logic/time-range'
import { hashFiles } from '../../../src/ports/deployer'
import { AppComponents } from '../../../src/types'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { buildDeployData } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resource-path'
import { TestProgram } from '../TestProgram'
import { createTestEnvironment } from '../IsolatedEnvironment'
import LeakDetector from 'jest-leak-detector'

const tmpRootDir = mkdtempSync(path.join(os.tmpdir(), 'delete-unreferenced-files-'))

describe('Integration - Delete unreferenced files', () => {
  let testEnvironment
  let server: TestProgram

  const fileContent = Buffer.from('some random content')

  beforeAll(async () => {
    mkdirSync(tmpRootDir, { recursive: true })

    testEnvironment = await createTestEnvironment()
    server = await testEnvironment.spawnServer([
      { key: EnvironmentConfig.DISABLE_SYNCHRONIZATION, value: true },
      { key: EnvironmentConfig.STORAGE_ROOT_FOLDER, value: tmpRootDir }
    ])
    await server.startProgram()
  })

  afterAll(async () => {
    rmSync(tmpRootDir, { recursive: true, force: true })
    jest.restoreAllMocks()
    await server.stopProgram()
    server = undefined as any
    await testEnvironment.clean()
    const detector = new LeakDetector(testEnvironment)
    testEnvironment = undefined as any
    expect(await detector.isLeaking()).toBe(false)
  })

  it('should delete unreferenced snapshot', async () => {
    const unreferencedFileHash = 'a-hash'
    await server.components.storage.storeStream(unreferencedFileHash, bufferToStream(fileContent))
    expect(await server.components.storage.exist(unreferencedFileHash)).toBeTruthy()
    await deleteUnreferencedFiles(server.components)
    expect(await server.components.storage.exist(unreferencedFileHash)).toBeFalsy()
  })

  it('should not delete entity file', async () => {
    makeNoopValidator(server.components)
    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'this is just some metadata' }
    })

    await server.deployEntity(deployResult.deployData)

    const contentsByHash: Map<string, Uint8Array> = await hashFiles(
      deployResult.deployData.files,
      deployResult.deployData.entityId
    )
    const contentFileHashes = Array.from(contentsByHash.keys())

    await deleteUnreferencedFiles(server.components)
    // There should be only one file, the entity file. Because it was deployed with no content files associated
    expect(contentFileHashes.length).toBe(1)
    expect(await server.components.storage.exist(contentFileHashes[0])).toBeTruthy()
  })

  it('should not delete entity file and its content file', async () => {
    makeNoopValidator(server.components)

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'this is just some metadata' },
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    await server.deployEntity(deployResult.deployData)

    const contentsByHash: Map<string, Uint8Array> = await hashFiles(
      deployResult.deployData.files,
      deployResult.deployData.entityId
    )
    const contentFileHashes = Array.from(contentsByHash.keys())

    await deleteUnreferencedFiles(server.components)
    // There should be two files, the entity file and its content file.
    expect(contentFileHashes.length).toBe(2)
    for (const usedHash of contentFileHashes) {
      expect(await server.components.storage.exist(usedHash)).toBeTruthy()
    }
  })

  it('should delete unreferenced files and not referenced ones', async () => {
    makeNoopValidator(server.components)
    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'this is just some metadata' },
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    await server.deployEntity(deployResult.deployData)

    const contentsByHash: Map<string, Uint8Array> = await hashFiles(
      deployResult.deployData.files,
      deployResult.deployData.entityId
    )
    const contentFileHashes = Array.from(contentsByHash.keys())

    const unreferencedFileHash = 'a-hash'
    await server.components.storage.storeStream(unreferencedFileHash, bufferToStream(fileContent))

    await deleteUnreferencedFiles(server.components)
    // There should be two files, the entity file and its content file.
    expect(contentFileHashes.length).toBe(2)
    for (const usedHash of contentFileHashes) {
      expect(await server.components.storage.exist(usedHash)).toBeTruthy()
    }
    expect(await server.components.storage.exist(unreferencedFileHash)).toBeFalsy()
  })

  it('should not delete snapshot files', async () => {
    const expectedClock = 1577836800000 + MS_PER_DAY
    jest.spyOn(server.components.clock, 'now').mockReturnValue(expectedClock)
    await startSnapshotNeededComponents(server.components)

    const snapshots = server.components.snapshotGenerator.getCurrentSnapshots()

    expect(snapshots).toHaveLength(1)

    if (snapshots && snapshots.length > 0) {
      const { hash } = snapshots[0]
      expect(await server.components.storage.exist(hash)).toBeTruthy()
      await deleteUnreferencedFiles(server.components)
      expect(await server.components.storage.exist(hash)).toBeTruthy()
    } else {
      expect(true).toBeFalsy()
    }
  })
})

async function startSnapshotNeededComponents(
  components: Pick<AppComponents, 'logs' | 'database' | 'storage' | 'fs' | 'snapshotGenerator'>
) {
  const startOptions = { started: jest.fn(), live: jest.fn(), getComponents: jest.fn() }
  await startComponent(components.database, startOptions)
  await startComponent(components.fs as IBaseComponent, startOptions)
  await startComponent(components.storage as IBaseComponent, startOptions)
  await startComponent(components.logs as IBaseComponent, startOptions)
  await startComponent(components.snapshotGenerator as IBaseComponent, startOptions)
}

async function startComponent(component: IBaseComponent, startOptions: IBaseComponent.ComponentStartOptions) {
  if (component.start) await component.start(startOptions)
}
