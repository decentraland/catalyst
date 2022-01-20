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
import * as fileHelpers from '../../../src/helpers/files'
import { metricsDeclaration } from '../../../src/metrics'
import { ContentFolderMigrationManager } from '../../../src/migrations/ContentFolderMigrationManager'
import { FileSystemUtils as fsu } from '../storage/FileSystemUtils'

describe('ContentFolderMigrationManager', () => {
  describe('when running the migration with no errors', () => {
    let moveFileSpy: jest.SpyInstance

    beforeAll(() => {
      moveFileSpy = jest.spyOn(fileHelpers, 'moveFile').mockResolvedValue()
    })

    afterAll(() => {
      moveFileSpy.mockRestore()
    })

    it('should call moveFile 10 times, once for each file', async () => {
      await runMigration()

      expect(moveFileSpy).toHaveBeenCalledTimes(10)
      expect(moveFileSpy.mock.calls).toEqual(
        expect.arrayContaining(files.map((file) => expect.arrayContaining([file, expect.any(String), file])))
      )
    })
  })
})

async function runMigration() {
  const logs = createLogComponent()
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const env = new Environment()

  const dir = fsu.createTempDirectory()
  env.setConfig(EnvironmentConfig.FOLDER_MIGRATION_MAX_CONCURRENCY, 2)
  env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, dir)

  const instance = new ContentFolderMigrationManager({ logs, env, metrics })
  await instance.run()

  while (instance.pendingInQueue() > 0) {
    await sleep(100)
  }
}
