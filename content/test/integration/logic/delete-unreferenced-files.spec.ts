import { bufferToStream } from '@dcl/catalyst-storage/dist/content-item'
import { IBaseComponent } from '@well-known-components/interfaces'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import { EnvironmentConfig } from '../../../src/Environment'
import { deleteUnreferencedFiles } from '../../../src/logic/delete-unreferenced-files'
import { MS_PER_DAY } from '../../../src/logic/time-range'
import { ServiceImpl } from '../../../src/service/ServiceImpl'
import { AppComponents } from '../../../src/types'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { setupTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resource-path'

const tmpRootDir = mkdtempSync(path.join(os.tmpdir(), 'delete-unreferenced-files-'))

describe('Delete unreferenced files - ', () => {
  const getTestEnv = setupTestEnvironment({ [EnvironmentConfig.STORAGE_ROOT_FOLDER]: tmpRootDir })

  const fileContent = Buffer.from('some random content')
  beforeEach(() => mkdirSync(tmpRootDir, { recursive: true }))
  afterEach(() => rmSync(tmpRootDir, { recursive: true, force: false }))

  testCaseWithComponents(getTestEnv, 'should delete unreferenced snapshot', async (components) => {
    const unreferencedFileHash = 'a-hash'
    await components.storage.storeStream(unreferencedFileHash, bufferToStream(fileContent))
    expect(await components.storage.exist(unreferencedFileHash)).toBeTruthy()
    await deleteUnreferencedFiles(components)
    expect(await components.storage.exist(unreferencedFileHash)).toBeFalsy()
  })

  it('should not delete entity file', async () => {
    const server = await getTestEnv()
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .andBuild()
    const components = server.components
    makeNoopValidator(components)
    await server.startProgram()
    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'this is just some metadata' }
    })

    await server.deployEntity(deployResult.deployData)

    const contentsByHash: Map<string, Uint8Array> = await ServiceImpl.hashFiles(
      deployResult.deployData.files,
      deployResult.deployData.entityId
    )
    const contentFileHashes = Array.from(contentsByHash.keys())

    await deleteUnreferencedFiles(components)
    // There should be only one file, the entity file. Because it was deployed with no content files associated
    expect(contentFileHashes.length).toBe(1)
    expect(await components.storage.exist(contentFileHashes[0])).toBeTruthy()
  })

  it('should not delete entity file and its content file', async () => {
    const server = await getTestEnv()
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .andBuild()
    const components = server.components
    makeNoopValidator(components)
    await server.startProgram()

    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'this is just some metadata' },
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    await server.deployEntity(deployResult.deployData)

    const contentsByHash: Map<string, Uint8Array> = await ServiceImpl.hashFiles(
      deployResult.deployData.files,
      deployResult.deployData.entityId
    )
    const contentFileHashes = Array.from(contentsByHash.keys())

    await deleteUnreferencedFiles(components)
    // There should be two files, the entity file and its content file.
    expect(contentFileHashes.length).toBe(2)
    for (const usedHash of contentFileHashes) {
      expect(await components.storage.exist(usedHash)).toBeTruthy()
    }
  })

  testCaseWithComponents(getTestEnv, 'should not delete snapshot file', async (components) => {
    // the clock is mocked so only one snapshot is created
    jest.spyOn(components.clock, 'now').mockReturnValue(1577836800000 + MS_PER_DAY)
    await startSnapshotNeededComponents(components)

    const snapshots = components.snapshotGenerator.getCurrentSnapshots()

    expect(snapshots).toHaveLength(1)

    if (snapshots && snapshots.length > 0) {
      const { hash } = snapshots[0]
      expect(await components.storage.exist(hash)).toBeTruthy()
      await deleteUnreferencedFiles(components)
      expect(await components.storage.exist(hash)).toBeTruthy()
    } else {
      expect(true).toBeFalsy()
    }
  })

  it('should delete unreferenced files and not referenced ones', async () => {
    const server = await getTestEnv()
      .configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .andBuild()
    const components = server.components
    makeNoopValidator(components)
    await server.startProgram()
    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: { a: 'this is just some metadata' },
      contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
    })

    await server.deployEntity(deployResult.deployData)

    const contentsByHash: Map<string, Uint8Array> = await ServiceImpl.hashFiles(
      deployResult.deployData.files,
      deployResult.deployData.entityId
    )
    const contentFileHashes = Array.from(contentsByHash.keys())

    const unreferencedFileHash = 'a-hash'
    await components.storage.storeStream(unreferencedFileHash, bufferToStream(fileContent))

    await deleteUnreferencedFiles(components)
    // There should be two files, the entity file and its content file.
    expect(contentFileHashes.length).toBe(2)
    for (const usedHash of contentFileHashes) {
      expect(await components.storage.exist(usedHash)).toBeTruthy()
    }
    expect(await components.storage.exist(unreferencedFileHash)).toBeFalsy()
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
