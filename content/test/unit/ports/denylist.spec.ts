import { createLogComponent } from '@well-known-components/logger'
import { resolve } from 'path'
import { Readable } from 'stream'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { createDenylist, Denylist } from '../../../src/ports/denylist'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { stopAllComponents } from '../../../src/logic/components-lifecycle'

async function setupLogs() {
  return await createLogComponent({
    config: createConfigComponent({
      LOG_LEVEL: 'DEBUG'
    })
  })
}

describe('when creating a denylist', () => {
  let denylist: Denylist | undefined = undefined
  const env = new Environment()
  const fetcher = { fetch: vi.fn() }
  env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'storage')
  env.setConfig(EnvironmentConfig.DENYLIST_FILE_NAME, 'denylist.txt')
  beforeAll(() => vi.useFakeTimers())
  afterAll(() => vi.useRealTimers())

  afterEach(async () => {
    if (denylist) {
      await stopAllComponents({ denylist })
    }
  })

  describe('with no denylist file and no urls to fetch', () => {
    it('should create it without errors and no items', async () => {
      const logs = await setupLogs()
      const fs = {
        createReadStream: vi.fn(),
        existPath: vi.fn().mockResolvedValue(false)
      }
      denylist = await createDenylist({ env, logs, fetcher, fs })
      await denylist.start!()
      expect(denylist.isDenylisted('denied1')).toBe(false)
      expect(fs.createReadStream).not.toBeCalled()
      expect(fetcher.fetch).not.toBeCalled()
    })
  })
  describe('with a denylist file and no urls to fetch denylists', () => {
    it('should create it with the denylisted items of the file', async () => {
      const logs = await setupLogs()
      const denylistFilePath = resolve('storage', 'denylist.txt')
      const fs = {
        createReadStream: vi.fn().mockReturnValue(
          Readable.from(`# Denylisted items:
              denied1
              denied2
              denied3`)
        ),
        existPath: vi.fn().mockResolvedValue(true)
      }
      const denylist = await createDenylist({ env, logs, fs, fetcher })
      await denylist.start!()
      expect(['denied1', 'denied2', 'denied3'].every((line) => denylist.isDenylisted(line))).toBe(true)
      expect(fs.createReadStream).toBeCalledWith(denylistFilePath, { encoding: 'utf-8' })
      expect(fetcher.fetch).not.toBeCalled()
    })
  })
  describe('with urls to fetch denylists and no denylist file', () => {
    it('should create it with the denylisted items of the urls', async () => {
      const logs = await setupLogs()
      const fs = {
        createReadStream: vi.fn().mockReturnValue(Readable.from(`denied1\n denied2`)),
        existPath: vi.fn().mockResolvedValue(false)
      }
      env.setConfig(EnvironmentConfig.DENYLIST_URLS, 'https://config.decentraland.org/denylist')
      const fetcher = {
        fetch: vi.fn().mockResolvedValue({ text: () => Promise.resolve(`denied3\ndenied4`) } as Partial<Response>)
      }
      const denylist = await createDenylist({ env, logs, fs, fetcher })
      await denylist.start!()
      expect(['denied3', 'denied4'].every((line) => denylist.isDenylisted(line))).toBe(true)
      expect(['denied1', 'denied2'].every((line) => denylist.isDenylisted(line))).toBe(false)
      expect(fetcher.fetch).toBeCalledWith('https://config.decentraland.org/denylist')
    })

    it('should create it without using the invalid url', async () => {
      const logs = await setupLogs()
      const fs = {
        createReadStream: vi.fn(),
        existPath: vi.fn().mockResolvedValue(false)
      }
      env.setConfig(EnvironmentConfig.DENYLIST_URLS, 'https://config.decentraland.org/denylist invalidUrl')
      const fetcher = {
        fetch: vi.fn().mockResolvedValue({ text: () => Promise.resolve(`denied3\ndenied4`) } as Partial<Response>)
      }
      denylist = await createDenylist({ env, logs, fs, fetcher })
      await denylist.start!()
      expect(fetcher.fetch).toBeCalledWith('https://config.decentraland.org/denylist')
      expect(fetcher.fetch).not.toBeCalledWith('invalidUrl')
    })
  })
  describe('with both a denylist file and urls to fetch denylists', () => {
    it('should create it with the merge of the items in both denylists', async () => {
      const logs = await setupLogs()
      const fs = {
        createReadStream: vi.fn().mockReturnValue(Readable.from(`denied1\n denied2`)),
        existPath: vi.fn().mockResolvedValue(true)
      }
      env.setConfig(EnvironmentConfig.DENYLIST_URLS, 'https://config.decentraland.org/denylist')
      const fetcher = {
        fetch: vi.fn().mockResolvedValue({ text: () => Promise.resolve(`denied3\ndenied4`) } as Partial<Response>)
      }
      denylist = await createDenylist({ env, logs, fs, fetcher })
      await denylist.start!()

      expect(['denied1', 'denied2', 'denied3', 'denied4'].every((line) => denylist!.isDenylisted(line))).toBe(true)
      expect(fetcher.fetch).toBeCalledWith('https://config.decentraland.org/denylist')
    })

    it('should create it with no denied content other than the specified in the denylists', async () => {
      const logs = await setupLogs()
      const fs = {
        createReadStream: vi.fn().mockReturnValue(Readable.from(`denied1\n denied2`)),
        existPath: vi.fn().mockResolvedValue(true)
      }
      env.setConfig(EnvironmentConfig.DENYLIST_URLS, 'https://config.decentraland.org/denylist')
      const fetcher = {
        fetch: vi.fn().mockResolvedValue({ text: () => Promise.resolve(`denied3\ndenied4`) } as Partial<Response>)
      }
      denylist = await createDenylist({ env, logs, fs, fetcher })
      await denylist.start!()
      expect(['otherDenied1', 'otherDenied2'].every((line) => denylist!.isDenylisted(line))).toBe(false)
      expect(fetcher.fetch).toBeCalledWith('https://config.decentraland.org/denylist')
    })
  })

  describe('when two minutes pass after the denylist was loaded', () => {
    it('should be reloaded and a new element added', async () => {
      const logs = await setupLogs()
      const fs = {
        createReadStream: vi
          .fn()
          .mockReturnValueOnce(
            Readable.from(`# Denylisted items:
            denied1
            denied2`)
          )
          .mockReturnValueOnce(
            Readable.from(`# Denylisted items:
            denied1
            denied2
            denied3`)
          ),
        existPath: vi.fn().mockResolvedValue(true)
      }
      denylist = await createDenylist({ env, logs, fs, fetcher })
      await denylist.start!()
      expect(['denied1', 'denied2'].every((item) => denylist!.isDenylisted(item))).toBe(true)
      vi.advanceTimersByTime(120_000)
      await flushPromises()
      expect(denylist.isDenylisted('denied3')).toBe(true)
    })
  })

  describe('when the denylist is stopped', () => {
    it('should not reload and add new elements after two minutes', async () => {
      const fs = {
        createReadStream: vi
          .fn()
          .mockReturnValueOnce(
            Readable.from(`# Denylisted items:
              denied1
              denied2`)
          )
          .mockReturnValueOnce(
            Readable.from(`# Denylisted items:
              denied1
              denied2
              denied3`)
          ),
        existPath: vi.fn().mockResolvedValue(true)
      }
      const logs = await createLogComponent({
        config: createConfigComponent({
          LOG_LEVEL: 'DEBUG'
        })
      })

      const denylist = await createDenylist({ env, logs, fs, fetcher })
      await denylist.start!()
      expect(['denied1', 'denied2'].every((item) => denylist.isDenylisted(item))).toBe(true)
      denylist.stop && denylist.stop()
      vi.advanceTimersByTime(120_00)
      await flushPromises()
      expect(denylist.isDenylisted('denied3')).toBe(false)
    })
  })
})

function flushPromises() {
  return new Promise(vi.requireActual('timers').setImmediate)
}
