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

async function setupLogs() {
  return await createLogComponent({
    config: createConfigComponent({ LOG_LEVEL: 'DEBUG' })
  })
}

function createDaoClient(servers: string[]): DAOComponent {
  return {
    getAllContentServers: jest.fn().mockResolvedValue(
      servers.map((address) => ({ address, owner: '0xOwner', id: '0' } as CatalystServerInfo))
    ),
    getAllServers: jest.fn()
  }
}

function daoServer(address: string, owner = '0xOwner'): CatalystServerInfo {
  return { address, owner, id: '0' }
}

describe('when creating a content cluster component', () => {
  const localAddress = 'http://local-server'
  const remoteAddress1 = 'http://remote-server-1'
  const remoteAddress2 = 'http://remote-server-2'

  afterAll(() => {
    jest.restoreAllMocks()
  })

  describe('when the component has not been started', () => {
    it('should return an empty server list', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()
      const daoClient = createDaoClient([localAddress, remoteAddress1])
      const cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 1000)

      expect(cluster.getAllServersInCluster()).toEqual([])
    })

    it('should return 0 as the last sync time', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()
      const daoClient = createDaoClient([localAddress])
      const cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 1000)

      expect(cluster.getStatus()).toEqual({ lastSyncWithDAO: 0 })
    })
  })

  describe('when the component is started', () => {
    it('should fetch servers from the DAO', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()
      const daoClient = createDaoClient([localAddress, remoteAddress1, remoteAddress2])
      const cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 1000)

      await cluster.start!({} as any)
      await cluster.stop!()

      expect(daoClient.getAllContentServers).toHaveBeenCalledTimes(1)
    })

    it('should exclude the local server address from the cluster', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()
      const daoClient = createDaoClient([localAddress, remoteAddress1, remoteAddress2])
      const cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 1000)

      await cluster.start!({} as any)
      await cluster.stop!()

      const servers = cluster.getAllServersInCluster()
      expect(servers).not.toContain(localAddress)
      expect(servers).toContain(remoteAddress1)
      expect(servers).toContain(remoteAddress2)
    })

    it('should handle case-insensitive address matching for self-exclusion', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, 'HTTP://LOCAL-SERVER/')
      const logs = await setupLogs()
      const daoClient = createDaoClient([localAddress, remoteAddress1])
      const cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 1000)

      await cluster.start!({} as any)
      await cluster.stop!()

      const servers = cluster.getAllServersInCluster()
      expect(servers).not.toContain(localAddress)
      expect(servers).toContain(remoteAddress1)
    })

    it('should update the last sync time', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()
      const daoClient = createDaoClient([localAddress, remoteAddress1])
      const clock = { now: jest.fn().mockReturnValue(5000) }
      const cluster = createContentCluster({ daoClient, logs, env, clock }, 1000)

      await cluster.start!({} as any)
      await cluster.stop!()

      expect(cluster.getStatus()).toEqual({ lastSyncWithDAO: 5000 })
    })

    it('should call registered sync callbacks', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()
      const daoClient = createDaoClient([localAddress, remoteAddress1])
      const cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 1000)
      const cb1 = jest.fn()
      const cb2 = jest.fn()
      cluster.onSyncFinished(cb1)
      cluster.onSyncFinished(cb2)

      await cluster.start!({} as any)
      await cluster.stop!()

      expect(cb1).toHaveBeenCalledTimes(1)
      expect(cb2).toHaveBeenCalledTimes(1)
      const receivedSet = cb1.mock.calls[0][0] as Set<string>
      expect(receivedSet.has(remoteAddress1)).toBe(true)
    })
  })

  describe('when the DAO server list changes on re-sync', () => {
    it('should add newly discovered servers', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()

      let cluster: IContentClusterComponent
      let callCount = 0
      const mockGetAll = jest.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return [daoServer(localAddress), daoServer(remoteAddress1)]
        }
        await cluster.stop!()
        return [daoServer(localAddress), daoServer(remoteAddress1), daoServer(remoteAddress2)]
      })
      const daoClient: DAOComponent = { getAllContentServers: mockGetAll, getAllServers: jest.fn() }

      cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 10)
      ;(sleep as jest.Mock).mockResolvedValue(undefined)

      const secondSync = new Promise<void>((resolve) => {
        let syncCount = 0
        cluster.onSyncFinished(() => {
          syncCount++
          if (syncCount === 2) resolve()
        })
      })

      await cluster.start!({} as any)
      await secondSync

      const servers = cluster.getAllServersInCluster()
      expect(servers).toContain(remoteAddress1)
      expect(servers).toContain(remoteAddress2)
    })

    it('should remove servers no longer in the DAO', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()

      let cluster: IContentClusterComponent
      let callCount = 0
      const mockGetAll = jest.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return [daoServer(localAddress), daoServer(remoteAddress1), daoServer(remoteAddress2)]
        }
        await cluster.stop!()
        return [daoServer(localAddress), daoServer(remoteAddress1)]
      })
      const daoClient: DAOComponent = { getAllContentServers: mockGetAll, getAllServers: jest.fn() }

      cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 10)
      ;(sleep as jest.Mock).mockResolvedValue(undefined)

      const secondSync = new Promise<void>((resolve) => {
        let syncCount = 0
        cluster.onSyncFinished(() => {
          syncCount++
          if (syncCount === 2) resolve()
        })
      })

      await cluster.start!({} as any)
      await secondSync

      const servers = cluster.getAllServersInCluster()
      expect(servers).toContain(remoteAddress1)
      expect(servers).not.toContain(remoteAddress2)
    })
  })

  describe('when the DAO returns no servers', () => {
    it('should not throw and return an empty server list', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()
      const daoClient = createDaoClient([])
      const cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 1000)

      await expect(cluster.start!({} as any)).resolves.not.toThrow()
      await cluster.stop!()
      expect(cluster.getAllServersInCluster()).toEqual([])
    })
  })

  describe('when the DAO call fails', () => {
    it('should not throw and return an empty server list', async () => {
      const env = new Environment()
      env.setConfig(EnvironmentConfig.CONTENT_SERVER_ADDRESS, localAddress)
      const logs = await setupLogs()
      const daoClient: DAOComponent = {
        getAllContentServers: jest.fn().mockRejectedValue(new Error('network error')),
        getAllServers: jest.fn()
      }
      const cluster = createContentCluster({ daoClient, logs, env, clock: { now: Date.now } }, 1000)

      await expect(cluster.start!({} as any)).resolves.not.toThrow()
      await cluster.stop!()
      expect(cluster.getAllServersInCluster()).toEqual([])
    })
  })
})
