let files = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

jest.mock('fs/promises', () => ({
  opendir: function* () {
    let current = 0
    while (current < files.length) {
      yield { name: files[current] }
      current++
    }
  },
  stat: () => ({
    isDirectory: () => false
  })
}))

import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { metricsDeclaration } from '../../../src/metrics'
import { migrateContentFolderStructure } from '../../../src/migrations/ContentFolderMigrationManager'
import { FileSystemContentStorage } from '../../../src/storage/FileSystemContentStorage'
import { FileSystemUtils as fsu } from '../storage/FileSystemUtils'

jest.mock('@catalyst/commons', () => ({
  ensureDirectoryExists: () => {}
}))

describe('ContentFolderMigrationManager', () => {
  let storeStreamSpy: jest.Mock

  let storage: FileSystemContentStorage

  describe('when running the migration with no errors', () => {
    beforeAll(() => {
      storeStreamSpy = jest.fn().mockResolvedValue(undefined)

      storage = {
        storeStream: storeStreamSpy
      } as any
    })

    afterAll(() => {
      storeStreamSpy.mockClear()
    })

    it('should call moveFile 10 times, once for each file', async () => {
      await runMigration(storage)

      expect(storeStreamSpy).toHaveBeenCalledTimes(10)
      expect(storeStreamSpy.mock.calls).toEqual(
        expect.arrayContaining(files.map((file) => expect.arrayContaining([file, expect.any(String), file])))
      )
    })
  })

  describe('when running the migration with an error', () => {
    beforeAll(() => {
      storeStreamSpy = jest.fn().mockRejectedValueOnce('Failure').mockResolvedValue(undefined)

      storage = {
        storeStream: storeStreamSpy
      } as any
    })

    afterAll(() => {
      storeStreamSpy.mockClear()
    })

    it('should call moveFile 11 times, once for each file', async () => {
      await runMigration(storage)

      expect(storeStreamSpy).toHaveBeenCalledTimes(11)
      expect(storeStreamSpy.mock.calls).toEqual(
        expect.arrayContaining(files.map((file) => expect.arrayContaining([file, expect.any(String), file])))
      )
    })
  })
})

async function runMigration(storage: FileSystemContentStorage) {
  const logs = createLogComponent()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const env = new Environment()

  const dir = fsu.createTempDirectory()
  env.setConfig(EnvironmentConfig.FOLDER_MIGRATION_MAX_CONCURRENCY, 2)
  env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, dir)

  await migrateContentFolderStructure({ logs, metrics, env, storage })

  // while (instance.pendingInQueue() > 0) {
  //   await sleep(100)
  // }
}
