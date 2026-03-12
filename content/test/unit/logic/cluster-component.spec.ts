import { CatalystServerInfo } from '@dcl/catalyst-contracts'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { Environment, EnvironmentConfig } from '../../../src/Environment'
import { DAOComponent } from '../../../src/ports/dao-servers-getter'
import { createContentCluster, IContentClusterComponent } from '../../../src/logic/cluster'

jest.mock('@dcl/snapshots-fetcher/dist/utils', () => ({
  ...jest.requireActual('@dcl/snapshots-fetcher/dist/utils'),
  sleep: jest.fn().mockResolvedValue(undefined)
}))

describe('contentCluster', () => {
  const address1 = 'http://server1'
  const address2 = 'http://server2'
  const address3 = 'http://server3'

  let env: Environment
  let daoClient: DAOComponent
  let clock: { now: jest.Mock }
  let component: IContentClusterComponent

  beforeEach(() => {
    jest.clearAllMocks()
    env = new Environment()
    env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, address1)
    clock = { now: jest.fn().mockReturnValue(1000) }
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  function createDaoClient(servers: string[]): DAOComponent {
    return {
      getAllContentServers: jest.fn().mockResolvedValue(
        servers.map((address) => ({ address, owner: '0xOwner', id: '0' } as CatalystServerInfo))
      ),
      getAllServers: jest.fn()
    }
  }

  async function buildComponent(daoServers: string[], timeBetweenSyncs = 1000) {
    daoClient = createDaoClient(daoServers)
    const logs = await createLogComponent({
      config: createConfigComponent({ LOG_LEVEL: 'DEBUG' })
    })
    component = createContentCluster({ daoClient, logs, env, clock }, timeBetweenSyncs)
    return component
  }

  describe('start', () => {
    it('should fetch servers from DAO on start', async () => {
      await buildComponent([address1, address2, address3])
      await component.start!({} as any)
      await component.stop!()

      expect(daoClient.getAllContentServers).toHaveBeenCalledTimes(1)
    })

    it('should exclude the local server address from the cluster', async () => {
      await buildComponent([address1, address2, address3])
      await component.start!({} as any)
      await component.stop!()

      const servers = component.getAllServersInCluster()
      expect(servers).not.toContain(address1)
      expect(servers).toContain(address2)
      expect(servers).toContain(address3)
    })

    it('should update the last sync time after fetching from DAO', async () => {
      await buildComponent([address1, address2])
      await component.start!({} as any)
      await component.stop!()

      expect(component.getStatus().lastSyncWithDAO).toBe(1000)
    })
  })

  describe('getAllServersInCluster', () => {
    it('should return an empty array before start', async () => {
      await buildComponent([address1, address2])
      expect(component.getAllServersInCluster()).toEqual([])
    })

    it('should return all servers except this one after start', async () => {
      await buildComponent([address1, address2, address3])
      await component.start!({} as any)
      await component.stop!()

      const servers = component.getAllServersInCluster()
      expect(servers).toHaveLength(2)
      expect(servers).toContain(address2)
      expect(servers).toContain(address3)
    })

    it('should handle case-insensitive address matching for self-exclusion', async () => {
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, 'HTTP://SERVER1/')
      await buildComponent(['http://server1', address2])
      await component.start!({} as any)
      await component.stop!()

      const servers = component.getAllServersInCluster()
      expect(servers).not.toContain('http://server1')
      expect(servers).toContain(address2)
    })
  })

  describe('onSyncFinished', () => {
    it('should call registered callbacks after sync', async () => {
      await buildComponent([address1, address2])
      const callback = jest.fn()
      component.onSyncFinished(callback)

      await component.start!({} as any)
      await component.stop!()

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(expect.any(Set))
      const receivedSet = callback.mock.calls[0][0] as Set<string>
      expect(receivedSet.has(address2)).toBe(true)
    })

    it('should support multiple callbacks', async () => {
      await buildComponent([address1, address2])
      const cb1 = jest.fn()
      const cb2 = jest.fn()
      component.onSyncFinished(cb1)
      component.onSyncFinished(cb2)

      await component.start!({} as any)
      await component.stop!()

      expect(cb1).toHaveBeenCalledTimes(1)
      expect(cb2).toHaveBeenCalledTimes(1)
    })
  })

  describe('server list updates', () => {
    it('should add newly discovered servers on DAO re-sync', async () => {
      let callCount = 0
      const mockGetAll = jest.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return [
            { address: address1, owner: '0x1', id: '0' },
            { address: address2, owner: '0x2', id: '0' }
          ]
        }
        await component.stop!()
        return [
          { address: address1, owner: '0x1', id: '0' },
          { address: address2, owner: '0x2', id: '0' },
          { address: address3, owner: '0x3', id: '0' }
        ]
      })

      daoClient = { getAllContentServers: mockGetAll, getAllServers: jest.fn() }
      const logs = await createLogComponent({
        config: createConfigComponent({ LOG_LEVEL: 'DEBUG' })
      })

      component = createContentCluster({ daoClient, logs, env, clock }, 10)
      ;(sleep as jest.Mock).mockResolvedValue(undefined)

      const secondSync = new Promise<void>((resolve) => {
        let syncCount = 0
        component.onSyncFinished(() => {
          syncCount++
          if (syncCount === 2) resolve()
        })
      })

      await component.start!({} as any)
      await secondSync

      const servers = component.getAllServersInCluster()
      expect(servers).toContain(address2)
      expect(servers).toContain(address3)
    })

    it('should remove servers no longer in the DAO', async () => {
      let callCount = 0
      const mockGetAll = jest.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return [
            { address: address1, owner: '0x1', id: '0' },
            { address: address2, owner: '0x2', id: '0' },
            { address: address3, owner: '0x3', id: '0' }
          ]
        }
        await component.stop!()
        return [
          { address: address1, owner: '0x1', id: '0' },
          { address: address2, owner: '0x2', id: '0' }
        ]
      })

      daoClient = { getAllContentServers: mockGetAll, getAllServers: jest.fn() }
      const logs = await createLogComponent({
        config: createConfigComponent({ LOG_LEVEL: 'DEBUG' })
      })

      component = createContentCluster({ daoClient, logs, env, clock }, 10)
      ;(sleep as jest.Mock).mockResolvedValue(undefined)

      const secondSync = new Promise<void>((resolve) => {
        let syncCount = 0
        component.onSyncFinished(() => {
          syncCount++
          if (syncCount === 2) resolve()
        })
      })

      await component.start!({} as any)
      await secondSync

      const servers = component.getAllServersInCluster()
      expect(servers).toContain(address2)
      expect(servers).not.toContain(address3)
    })
  })

  describe('error handling', () => {
    it('should not throw when DAO returns no servers', async () => {
      await buildComponent([])
      await expect(component.start!({} as any)).resolves.not.toThrow()
      await component.stop!()
      expect(component.getAllServersInCluster()).toEqual([])
    })

    it('should not throw when DAO call fails', async () => {
      daoClient = {
        getAllContentServers: jest.fn().mockRejectedValue(new Error('network error')),
        getAllServers: jest.fn()
      }
      const logs = await createLogComponent({
        config: createConfigComponent({ LOG_LEVEL: 'DEBUG' })
      })
      component = createContentCluster({ daoClient, logs, env, clock }, 1000)

      await expect(component.start!({} as any)).resolves.not.toThrow()
      await component.stop!()
      expect(component.getAllServersInCluster()).toEqual([])
    })
  })

  describe('getStatus', () => {
    it('should return 0 as lastSyncWithDAO before any sync', async () => {
      await buildComponent([address1])
      expect(component.getStatus()).toEqual({ lastSyncWithDAO: 0 })
    })

    it('should return the clock time after a successful sync', async () => {
      clock.now.mockReturnValue(5000)
      await buildComponent([address1, address2])
      await component.start!({} as any)
      await component.stop!()

      expect(component.getStatus()).toEqual({ lastSyncWithDAO: 5000 })
    })
  })
})
