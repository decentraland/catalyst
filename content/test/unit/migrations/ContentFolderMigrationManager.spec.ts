let files = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

jest.mock('fs/promises', () => ({
  opendir: function* () {
    let current = 0
    while (current < files.length) {
      yield { name: files[current] }
      current++
    }
  }
}))

jest.mock('@catalyst/commons', () => ({
  ensureDirectoryExists: () => {}
}))

import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { metricsDeclaration } from '../../../src/metrics'
import { ContentFolderMigrationManager } from '../../../src/migrations/ContentFolderMigrationManager'
import { FileSystemContentStorage } from '../../../src/storage/FileSystemContentStorage'
import { FileSystemUtils as fsu } from '../storage/FileSystemUtils'

describe('ContentFolderMigrationManager', () => {
  let storeExistingContentItemSpy: jest.Mock

  let storage: FileSystemContentStorage

  describe('when running the migration with no errors', () => {
    beforeAll(() => {
      storeExistingContentItemSpy = jest.fn().mockResolvedValue(undefined)

      storage = {
        storeExistingContentItem: storeExistingContentItemSpy
      } as any
    })

    afterAll(() => {
      storeExistingContentItemSpy.mockClear()
    })

    it('should call moveFile 10 times, once for each file', async () => {
      await runMigration(storage)

      expect(storeExistingContentItemSpy).toHaveBeenCalledTimes(10)
      expect(storeExistingContentItemSpy.mock.calls).toEqual(
        expect.arrayContaining(files.map((file) => expect.arrayContaining([file, expect.any(String), file])))
      )
    })
  })

  describe('when running the migration with an error', () => {
    beforeAll(() => {
      storeExistingContentItemSpy = jest.fn().mockRejectedValueOnce('Failure').mockResolvedValue(undefined)

      storage = {
        storeExistingContentItem: storeExistingContentItemSpy
      } as any
    })

    afterAll(() => {
      storeExistingContentItemSpy.mockClear()
    })

    it('should call moveFile 11 times, once for each file', async () => {
      await runMigration(storage)

      expect(storeExistingContentItemSpy).toHaveBeenCalledTimes(11)
      expect(storeExistingContentItemSpy.mock.calls).toEqual(
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

  const instance = new ContentFolderMigrationManager({ logs, env, metrics, storage })
  await instance.run()

  while (instance.pendingInQueue() > 0) {
    await sleep(100)
  }
}
