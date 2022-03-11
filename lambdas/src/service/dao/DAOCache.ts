import { DAOContractClient, ServerMetadata } from '@dcl/catalyst-node-commons'
import { TimeRefreshedDataHolder } from '../../utils/TimeRefreshedDataHolder'
import { DAOListClient } from './DAOListsClient'

const REFRESH_TIME: string = '30m'

export class DAOCache {
  private servers: TimeRefreshedDataHolder<Set<ServerMetadata>>
  private pois: TimeRefreshedDataHolder<Set<string>>
  private denylistedNames: TimeRefreshedDataHolder<Set<string>>

  constructor(daoClient: DAOContractClient, poisClient: DAOListClient, denylistedNamesClient: DAOListClient) {
    this.servers = new TimeRefreshedDataHolder(() => daoClient.getAllServers(), REFRESH_TIME)
    this.pois = new TimeRefreshedDataHolder(() => poisClient.getAllValues(), REFRESH_TIME)
    this.denylistedNames = new TimeRefreshedDataHolder(() => denylistedNamesClient.getAllValues(), REFRESH_TIME)
  }

  async getServers(): Promise<Set<ServerMetadata>> {
    return this.servers.get()
  }

  async getPOIs(): Promise<Set<string>> {
    return this.pois.get()
  }

  async getDenylistedNames(): Promise<Set<string>> {
    return this.denylistedNames.get()
  }
}
