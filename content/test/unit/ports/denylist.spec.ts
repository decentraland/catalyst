import { createLogComponent } from '@well-known-components/logger'
import path from 'path'
import { Readable } from 'stream'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { createDenylistComponent } from '../../../src/ports/denylist'
import { createFsComponent } from '../../../src/ports/fs'

const lines = ['my\n', 'first\n', 'denylisted\n', 'item\n']

describe('denylist', () => {
  describe('when creating a denylist it should read a file to load the denylisted items', () => {
    const env = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'inexistent')
    env.setConfig(EnvironmentConfig.DENYLIST_FILE_NAME, 'file')
    const logs = createLogComponent()

    it('should have denylisted each line from the file', async () => {
      const fs = createFsComponent()
      fs.access = jest.fn().mockResolvedValue(undefined)
      fs.createReadStream = jest.fn().mockReturnValue(Readable.from(lines))
      const denylist = await createDenylistComponent({ env, logs, fs })

      expect(lines.every((line) => denylist.isDenyListed(line.trimEnd()))).toBe(true)
    })

    it('should not have denylisted another word', async () => {
      const fs = createFsComponent()
      fs.access = jest.fn().mockResolvedValue(undefined)
      fs.createReadStream = jest.fn().mockReturnValue(Readable.from(lines))
      const denylist = await createDenylistComponent({ env, logs, fs })

      expect(fs.createReadStream).toBeCalled()
      expect(denylist.isDenyListed('RANDOM')).toBe(false)
    })

    it('should create a denylist file if it does not exist', async () => {
      const fs = createFsComponent()
      fs.access = jest.fn().mockRejectedValue(undefined)
      fs.createReadStream = jest.fn().mockReturnValue(Readable.from(lines))
      const fileMock = { close: jest.fn() }
      fs.open = jest.fn().mockResolvedValue(fileMock)
      const expectedDenylistFilePath = path.resolve(
        env.getConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER), env.getConfig(EnvironmentConfig.DENYLIST_FILE_NAME))

      await createDenylistComponent({ env, logs, fs })
      expect(fs.open).toBeCalledWith(expectedDenylistFilePath, 'a')
      expect(fileMock.close).toBeCalled()
    })
  })
})
