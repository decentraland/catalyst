let files = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']

jest.mock('fs/promises', () => ({
  readdir: () => files
}))

jest.mock('@catalyst/commons', () => ({
  ensureDirectoryExists: () => {}
}))

import { createLogComponent } from '@well-known-components/logger'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import * as fileHelpers from '../../../src/helpers/files'
import { ContentFolderMigrationManager } from '../../../src/migrations/ContentFolderMigrationManager'
import { FileSystemUtils as fsu } from '../storage/FileSystemUtils'

describe('ContentFolderMigrationManager', () => {
  describe('when running the migration with no errors', () => {
    let moveFileSpy: jest.SpyInstance
    let instance: ContentFolderMigrationManager

    beforeAll(() => {
      moveFileSpy = jest.spyOn(fileHelpers, 'moveFile').mockResolvedValue()
    })

    afterAll(() => {
      moveFileSpy.mockRestore()
    })

    it('should call moveFile 10 times, once for each file', async () => {
      const logs = createLogComponent()
      const env = new Environment()

      const dir = fsu.createTempDirectory()
      env.setConfig(EnvironmentConfig.FOLDER_MIGRATION_BLOCK_SIZE, 2)
      env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, dir)

      instance = new ContentFolderMigrationManager({ logs, env })
      await instance.run()

      expect(moveFileSpy).toHaveBeenCalledTimes(10)
      expect(moveFileSpy.mock.calls).toEqual(
        expect.arrayContaining(files.map((file) => expect.arrayContaining([file, expect.any(String), file])))
      )
    })
  })

  describe('when running the migration with one intermittent error', () => {
    let moveFileSpy: jest.SpyInstance
    let instance: ContentFolderMigrationManager

    beforeAll(() => {
      moveFileSpy = jest.spyOn(fileHelpers, 'moveFile').mockRejectedValueOnce('Failure').mockResolvedValue()
    })

    afterAll(() => {
      moveFileSpy.mockRestore()
    })

    it('should call moveFile 11 times, once for each file and one repeated', async () => {
      const logs = createLogComponent()
      const env = new Environment()
      env.setConfig(EnvironmentConfig.FOLDER_MIGRATION_BLOCK_SIZE, 2)
      env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, fsu.createTempDirectory())

      instance = new ContentFolderMigrationManager({ logs, env })
      await instance.run()

      expect(moveFileSpy).toHaveBeenCalledTimes(11)
      expect(moveFileSpy.mock.calls).toEqual(
        expect.arrayContaining(files.map((file) => expect.arrayContaining([file, expect.any(String), file])))
      )
    })
  })
})
