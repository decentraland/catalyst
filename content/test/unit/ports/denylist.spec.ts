import { createLogComponent } from '@well-known-components/logger'
import { resolve } from 'path'
import { Readable } from 'stream'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { createDenylist } from '../../../src/ports/denylist'

describe('when creating a denylist', () => {
  const env = new Environment()
  const logs = createLogComponent()
  const fetcher = { fetch: jest.fn() }
  env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'storage')
  env.setConfig(EnvironmentConfig.DENYLIST_FILE_NAME, 'denylist.txt')
  beforeAll(() => jest.useFakeTimers())
  afterAll(() => jest.useRealTimers())

  describe('with no denylist file and no urls to fetch', () => {
    it('should create it without errors and no items', async () => {
      const fs = {
        createReadStream: jest.fn(),
        existPath: jest.fn().mockResolvedValue(false)
      }
      const denylist = await createDenylist({ env, logs, fetcher, fs  })
      expect(denylist.isDenylisted('denied1')).toBe(false)
      expect(fs.createReadStream).not.toBeCalled()
      expect(fetcher.fetch).not.toBeCalled()
     })
  })
  describe('with a denylist file and no urls to fetch denylists', () => {
    it('should create it with the denylisted items of the file', async () => {
      const denylistFilePath = resolve('storage', 'denylist.txt')
      const fs = {
        createReadStream: jest.fn().mockReturnValue(Readable.from(`# Denylisted items:
            denied1
            denied2
            denied3`)),
        existPath: jest.fn().mockResolvedValue(true)
      }
      const denylist = await createDenylist({ env, logs, fs, fetcher })
      expect(['denied1', 'denied2', 'denied3'].every((line) => denylist.isDenylisted(line))).toBe(true)
      expect(fs.createReadStream).toBeCalledWith(denylistFilePath, { encoding: 'utf-8'})
      expect(fetcher.fetch).not.toBeCalled()
     })
  })
  describe('with urls to fetch denylists and no denylist file', () => {
    it('should create it with the denylisted items of the urls', async () => {
      const fs = {
        createReadStream: jest.fn().mockReturnValue(Readable.from(`denied1\n denied2`)),
        existPath: jest.fn().mockResolvedValue(false)
      }
      env.setConfig(EnvironmentConfig.DENYLIST_URLS, 'https://config.decentraland.org/denylist')
      const fetcher = {
        fetch: jest.fn().mockResolvedValue(
          { text: () => Promise.resolve(`denied3\ndenied4`)} as Partial<Response>
        )
      }
      const denylist = await createDenylist({ env, logs, fs, fetcher })
      expect(['denied3', 'denied4'].every((line) => denylist.isDenylisted(line))).toBe(true)
      expect(['denied1', 'denied2'].every((line) => denylist.isDenylisted(line))).toBe(false)
      expect(fetcher.fetch).toBeCalledWith('https://config.decentraland.org/denylist')
    })

    it('should create it without using the invalid url', async () => {
      const fs = {
        createReadStream: jest.fn(),
        existPath: jest.fn().mockResolvedValue(false)
      }
      env.setConfig(EnvironmentConfig.DENYLIST_URLS, 'https://config.decentraland.org/denylist invalidUrl')
      const fetcher = {
        fetch: jest.fn().mockResolvedValue(
          { text: () => Promise.resolve(`denied3\ndenied4`)} as Partial<Response>
        )
      }
      await createDenylist({ env, logs, fs, fetcher })
      expect(fetcher.fetch).toBeCalledWith('https://config.decentraland.org/denylist')
      expect(fetcher.fetch).not.toBeCalledWith('invalidUrl')
    })
  })
  describe('with both a denylist file and urls to fetch denylists', () => {
    it('should create it with the merge of the items in both denylists', async () => {
      const fs = {
        createReadStream: jest.fn().mockReturnValue(Readable.from(`denied1\n denied2`)),
        existPath: jest.fn().mockResolvedValue(true)
      }
      env.setConfig(EnvironmentConfig.DENYLIST_URLS, 'https://config.decentraland.org/denylist')
      const fetcher = {
        fetch: jest.fn().mockResolvedValue(
          { text: () => Promise.resolve(`denied3\ndenied4`)} as Partial<Response>
        )
      }
      const denylist = await createDenylist({ env, logs, fs, fetcher })
      expect(['denied1', 'denied2', 'denied3', 'denied4'].every((line) => denylist.isDenylisted(line))).toBe(true)
      expect(fetcher.fetch).toBeCalledWith('https://config.decentraland.org/denylist')
     })

    it('should create it with no denied content other than the specified in the denylists', async () => {
    const fs = {
      createReadStream: jest.fn().mockReturnValue(Readable.from(`denied1\n denied2`)),
      existPath: jest.fn().mockResolvedValue(true)
    }
    env.setConfig(EnvironmentConfig.DENYLIST_URLS, 'https://config.decentraland.org/denylist')
    const fetcher = {
      fetch: jest.fn().mockResolvedValue(
        { text: () => Promise.resolve(`denied3\ndenied4`)} as Partial<Response>
      )
    }
    const denylist = await createDenylist({ env, logs, fs, fetcher })
    expect(['otherDenied1', 'otherDenied2'].every((line) => denylist.isDenylisted(line))).toBe(false)
    expect(fetcher.fetch).toBeCalledWith('https://config.decentraland.org/denylist')
    })
  })
})

describe('when two minutes pass after the denylist was loaded', () => {
  const env = new Environment()
  const logs = createLogComponent()
  const fetcher = { fetch: jest.fn() }
  env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'storage')
  env.setConfig(EnvironmentConfig.DENYLIST_FILE_NAME, 'denylist.txt')
  beforeAll(() => jest.useFakeTimers())
  afterAll(() => jest.useRealTimers())
  it ('should be reloaded and a new element added', async () => {
    const fs = {
      createReadStream: jest.fn()
      .mockReturnValueOnce(Readable.from(`# Denylisted items:
          denied1
          denied2`))
      .mockReturnValueOnce((Readable.from(`# Denylisted items:
          denied1
          denied2
          denied3`))),
      existPath: jest.fn().mockResolvedValue(true)
    }
    const denylist = await createDenylist({ env, logs, fs, fetcher })
    expect(['denied1', 'denied2'].every((item) => denylist.isDenylisted(item))).toBe(true)
    jest.advanceTimersByTime(120_000)
    await flushPromises()
    expect(denylist.isDenylisted('denied3')).toBe(true)
  })
})

describe('when the denylist is stopped', () => {
    const env = new Environment()
    const logs = createLogComponent()
    const fetcher = { fetch: jest.fn() }
    env.setConfig(EnvironmentConfig.STORAGE_ROOT_FOLDER, 'storage')
    env.setConfig(EnvironmentConfig.DENYLIST_FILE_NAME, 'denylist.txt')
    beforeAll(() => jest.useFakeTimers())
    afterAll(() => jest.useRealTimers())
    it ('should not reload and add new elements after two minutes', async () => {
      const fs = {
        createReadStream: jest.fn()
        .mockReturnValueOnce(Readable.from(`# Denylisted items:
            denied1
            denied2`))
        .mockReturnValueOnce((Readable.from(`# Denylisted items:
            denied1
            denied2
            denied3`))),
        existPath: jest.fn().mockResolvedValue(true)
      }
      const denylist = await createDenylist({ env, logs, fs, fetcher })
      expect(['denied1', 'denied2'].every((item) => denylist.isDenylisted(item))).toBe(true)
      denylist.stop && denylist.stop()
      jest.advanceTimersByTime(120_00)
      await flushPromises()
      expect(denylist.isDenylisted('denied3')).toBe(false)
    })
})

function flushPromises() {
  return new Promise(jest.requireActual("timers").setImmediate)
}
