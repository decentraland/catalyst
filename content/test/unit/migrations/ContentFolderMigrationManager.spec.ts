import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { metricsDeclaration } from '../../../src/metrics'
import { migrateContentFolderStructure } from '../../../src/migrations/ContentFolderMigrationManager'
import { ContentStorage } from '../../../src/ports/contentStorage/contentStorage'
import { createFsComponent } from '../../../src/ports/fs'
import { FileSystemUtils as fsu } from '../ports/contentStorage/FileSystemUtils'

let files = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

describe('ContentFolderMigrationManager', () => {
  let storeStreamSpy: jest.Mock

  let storage: ContentStorage

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
})

async function runMigration(storage: ContentStorage) {
  const logs = createLogComponent()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const env = new Environment()

  const dir = fsu.createTempDirectory()
  env.setConfig(EnvironmentConfig.FOLDER_MIGRATION_MAX_CONCURRENCY, 2)
  env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, dir)

  const fs = createFsComponent()
  fs.unlink = async () => {}
  fs.createReadStream = jest.fn().mockImplementation((x) => x)
  fs.ensureDirectoryExists = async () => {}
  fs.stat = jest.fn().mockResolvedValue(({ isDirectory: () => false }))
  fs.opendir = jest.fn().mockImplementation(function* () {
    let current = 0
    while (current < files.length) {
      yield { name: files[current] }
      current++
    }
  })

  await migrateContentFolderStructure({ logs, metrics, env, storage, fs })
}
