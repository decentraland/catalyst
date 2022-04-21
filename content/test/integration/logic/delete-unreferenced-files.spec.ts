import { ContentFileHash } from 'dcl-catalyst-commons'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import { EnvironmentConfig } from '../../../src/Environment'
import { deleteUnreferencedFiles } from '../../../src/logic/delete-unreferenced-files'
import { bufferToStream } from '../../../src/ports/contentStorage/contentStorage'
import { ServiceImpl } from '../../../src/service/ServiceImpl'
import { makeNoopValidator } from '../../helpers/service/validations/NoOpValidator'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'
import { buildDeployData } from '../E2ETestUtils'
import { getIntegrationResourcePathFor } from '../resources/get-resource-path'

const tmpRootDir = mkdtempSync(path.join(os.tmpdir(), 'delete-unreferenced-files-'))

loadStandaloneTestEnvironment({ [EnvironmentConfig.STORAGE_ROOT_FOLDER]: tmpRootDir })('Delete unreferenced files - ', (testEnv) => {
  const fileContent = Buffer.from("some random content")
  beforeEach(() => mkdirSync(tmpRootDir, { recursive: true }))
  afterEach(() => rmSync(tmpRootDir, { recursive: true, force: false }))

  testCaseWithComponents(
    testEnv,
    'should delete unreferenced snapshot',
    async (components) => {
      const unreferencedFileHash = 'a-hash'
      await components.storage.storeStream(unreferencedFileHash, bufferToStream(fileContent))
      expect(await components.storage.exist(unreferencedFileHash)).toBeTruthy()
      await deleteUnreferencedFiles(components)
      expect(await components.storage.exist(unreferencedFileHash)).toBeFalsy()
    }
  )

  it('should not delete entity file', async () => {
    const server = await testEnv.configServer()
      .withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true)
      .andBuild()
    const components = server.components
    makeNoopValidator(components)
    await server.startProgram()
    const deployResult = await buildDeployData(['0,0', '0,1'], {
      metadata: 'this is just some metadata'
    })

    await server.deploy(deployResult.deployData)

    const contentsByHash: Map<ContentFileHash, Uint8Array> = await ServiceImpl.hashFiles(deployResult.deployData.files, deployResult.deployData.entityId)
    const contentFileHashes = Array.from(contentsByHash.keys())
    const unreferencedFileHash = 'a-hash'
    await components.storage.storeStream(unreferencedFileHash, bufferToStream(fileContent))

    await deleteUnreferencedFiles(components)
    expect(await components.storage.exist(unreferencedFileHash)).toBeFalsy()
    // There should be only one file, the entity file. Because it was deployed with no content files associated
    expect(contentFileHashes.length).toBe(1)
    expect(await components.storage.exist(contentFileHashes[0])).toBeTruthy()
})

  it('should not delete entity file and its content file', async () => {
      const server = await testEnv.configServer().withConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION, true).andBuild()
      const components = server.components
      makeNoopValidator(components)
      await server.startProgram()
      const deployResult = await buildDeployData(['0,0', '0,1'], {
        metadata: 'this is just some metadata',
        contentPaths: [getIntegrationResourcePathFor('some-binary-file.png')]
      })

      await server.deploy(deployResult.deployData)

      const contentsByHash: Map<ContentFileHash, Uint8Array> = await ServiceImpl.hashFiles(deployResult.deployData.files, deployResult.deployData.entityId)
      const contentFileHashes = Array.from(contentsByHash.keys())

      const unreferencedFileHash = 'a-hash'
      await components.storage.storeStream(unreferencedFileHash, bufferToStream(fileContent))


      await deleteUnreferencedFiles(components)
      expect(await components.storage.exist(unreferencedFileHash)).toBeFalsy()
      // There should be two files, the entity file and its content file.
      expect(contentFileHashes.length).toBe(2)
      for (const usedHash of contentFileHashes) {
        expect(await components.storage.exist(usedHash)).toBeTruthy()
      }
  })
})
