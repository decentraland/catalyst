import { CatalystServerInfo } from '@dcl/catalyst-contracts'
import { sleep } from '@dcl/snapshots-fetcher/dist/utils'
import { ILoggerComponent } from '@well-known-components/interfaces'
import future from 'fp-future'
import { EnvironmentConfig } from '../../Environment'
import { AppComponents } from '../../types'
import { IContentClusterComponent } from './types'

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function normalizeContentBaseUrl(url: string): string {
  return url.toLowerCase().replace(/\/$/, '')
}

function getAllOtherAddressesOnDAO(
  allServers: Array<CatalystServerInfo>,
  normalizedContentServerAddress: string
): string[] {
  const serverUrls = allServers
    .map(({ address }) => address)
    .filter((address) => normalizeContentBaseUrl(address) != normalizedContentServerAddress)

  return shuffleArray(serverUrls)
}

export function createContentCluster(
  components: Pick<AppComponents, 'logs' | 'daoClient' | 'env' | 'clock'>,
  timeBetweenSyncs: number
): IContentClusterComponent {
  const logger: ILoggerComponent.ILogger = components.logs.getLogger('ContentCluster')

  const serverClients: Set<string> = new Set()
  let timeOfLastSync: number = 0
  const syncFinishedEventCallbacks: Array<(serverClients: Set<string>) => void> = []
  const stoppedFuture = future<void>()

  const normalizedContentServerAddress = normalizeContentBaseUrl(
    components.env.getConfig<string>(EnvironmentConfig.CONTENT_SERVER_ADDRESS)
  )

  async function getContentServersFromDao(): Promise<string[]> {
    try {
      const allServersInDAO = await components.daoClient.getAllContentServers()

      if (allServersInDAO.length == 0) {
        throw new Error('There are no servers.')
      }

      const allServerBaseUrls = getAllOtherAddressesOnDAO(allServersInDAO, normalizedContentServerAddress)

      // Remove servers no longer in DAO
      for (const serverBaseUrl of serverClients) {
        if (!allServerBaseUrls.includes(serverBaseUrl)) {
          serverClients.delete(serverBaseUrl)
          logger.info(`Removing server '${serverBaseUrl}'`)
        }
      }

      // Detect new servers
      for (const serverBaseUrl of allServerBaseUrls) {
        if (!serverClients.has(serverBaseUrl)) {
          serverClients.add(serverBaseUrl)
          logger.info(`Discovered new server '${serverBaseUrl}'.`)
        }
      }

      timeOfLastSync = components.clock.now()

      for (const cb of syncFinishedEventCallbacks) {
        cb(serverClients)
      }
    } catch (error) {
      logger.error(`Failed to sync with the DAO \n${error}`)
    }
    return Array.from(serverClients)
  }

  async function syncWithDAOJob() {
    logger.info(`Starting sync with DAO every ${timeBetweenSyncs}ms`)

    while (stoppedFuture.isPending) {
      await Promise.race([sleep(timeBetweenSyncs), stoppedFuture])
      if (!stoppedFuture.isPending) return
      await getContentServersFromDao()
    }
  }

  return {
    async start() {
      await getContentServersFromDao()
      syncWithDAOJob().catch(logger.error)
    },

    async stop() {
      stoppedFuture.resolve()
    },

    getAllServersInCluster(): string[] {
      return Array.from(serverClients)
    },

    onSyncFinished(cb: (serverClients: Set<string>) => void): void {
      syncFinishedEventCallbacks.push(cb)
    },

    getStatus(): { lastSyncWithDAO: number } {
      return { lastSyncWithDAO: timeOfLastSync }
    }
  }
}
