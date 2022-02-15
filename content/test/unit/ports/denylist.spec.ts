import { createLogComponent } from '@well-known-components/logger'
import { Readable } from 'stream'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { createDenylistComponent } from '../../../src/ports/denylist'
import { createFsComponent } from '../../../src/ports/fs'

const lines = ['my\n', 'first\n', 'denylisted\n', 'item\n']

jest.mock('@catalyst/commons', () => ({
  existPath: () => true
}))

describe('denylist', () => {
  describe('when creating a denylist it should read a file to load the denylisted items', () => {
    const env = new Environment()
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'inexistent')
    env.setConfig(EnvironmentConfig.DENYLIST_FILE_NAME, 'file')
    const logs = createLogComponent()

    it('should have denylisted each line from the file', async () => {
      const fs = createFsComponent()
      fs.createReadStream = jest.fn().mockResolvedValue(Readable.from(lines))
      const denylist = await createDenylistComponent({ env, logs, fs })

      expect(lines.every((line) => denylist.isDenyListed(line.trimEnd()))).toBe(true)
    })

    it('should not have denylisted another word', async () => {
      const fs = createFsComponent()
      fs.createReadStream = jest.fn().mockResolvedValue(Readable.from(lines))
      const denylist = await createDenylistComponent({ env, logs, fs })

      expect(denylist.isDenyListed('RANDOM')).toBe(false)
    })
  })
})
