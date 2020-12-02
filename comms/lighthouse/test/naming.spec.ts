// Because of Bazel sandboxing, we need this for the time being
process.env.LIGHTHOUSE_STORAGE_LOCATION = '.'

import { DAOClient } from 'decentraland-katalyst-commons/DAOClient'
import { pickName, defaultNames } from '../src/naming'
import { ServerMetadata } from 'decentraland-katalyst-commons/ServerMetadata'
import { lighthouseStorage } from '../src/simpleStorage'

declare var global: any

const oldFetch = global.fetch

// @ts-ignore
const daoClient: DAOClient = {
  async getAllServers(): Promise<Set<ServerMetadata>> {
    return new Set([{ id: 'id', address: '0x...', owner: '0x...' }])
  }
}

let existingName = 'fenrir'

describe('picking a name', function () {
  beforeAll(() => {
    global.fetch = (input, init) => {
      return Promise.resolve(new Response(`{"name": "${existingName}"}`))
    }
  })

  afterAll(() => {
    global.fetch = oldFetch
  })

  afterEach(async () => {
    await lighthouseStorage.clear()
  })

  it('picks up a default name when the name is no in the DAO', async () => {
    for (let i = 0; i < 100; i++) {
      const name = await pickName(undefined, daoClient)

      expect(name).not.toBe(existingName)
      expect(defaultNames.includes(name)).toBe(true)

      await lighthouseStorage.clear()
    }
  })

  it('picks up a configured name when the name is not in the DAO', async () => {
    for (let i = 0; i < 20; i++) {
      const name = await pickName('rick,morty', daoClient)

      expect(name).not.toBe(existingName)
      expect(['rick', 'morty'].includes(name)).toBe(true)

      await lighthouseStorage.clear()
    }
  })

  it('tries to reuse the previous name', async () => {
    const previousName = await pickName(undefined, daoClient)

    const currentName = await pickName(undefined, daoClient)

    expect(currentName).toBe(previousName)
  })

  it("doesn't reuse the previous name if it was taken", async () => {
    const previousName = await pickName(undefined, daoClient)

    existingName = previousName

    const currentName = await pickName(undefined, daoClient)

    expect(currentName).not.toBe(previousName)
  })

  it("fails if it can't use any of the names available", async () => {
    try {
      await pickName(existingName, daoClient)
      fail()
    } catch (e) {
      expect(e.message).toBe('Could not set my name! Names taken: ' + existingName)
    }
  })
})
