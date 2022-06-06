import { ServerMetadata } from 'dcl-catalyst-client'
import {
  getAllCatalystFromProvider,
  ListContract,
  nameDenylistForProvider,
  poiListForProvider
} from '@dcl/catalyst-contracts'
import { TimeRefreshedDataHolder } from '../../utils/TimeRefreshedDataHolder'
import { HTTPProvider, bytesToHex } from 'eth-connect'

const REFRESH_TIME: string = '30m'

async function getServers(provider: HTTPProvider): Promise<Set<ServerMetadata>> {
  const servers = await getAllCatalystFromProvider(provider)

  return new Set(
    servers.map(($) => {
      return {
        baseUrl: $.domain,
        owner: $.owner,
        id: '0x' + bytesToHex($.id)
      }
    })
  )
}

async function materializeListFromContract(contract: ListContract): Promise<Array<string>> {
  const max = (await contract.size()).toNumber()
  return Promise.all(new Array(max).fill('').map((_, ix) => contract.get(ix)))
}

async function getPois(provider: HTTPProvider): Promise<Set<string>> {
  const contract = await poiListForProvider(provider)
  return new Set(await materializeListFromContract(contract))
}

async function getBannedNames(provider: HTTPProvider): Promise<Set<string>> {
  const contract = await nameDenylistForProvider(provider)
  return new Set(await materializeListFromContract(contract))
}

export class DAOCache {
  private servers: TimeRefreshedDataHolder<Set<ServerMetadata>>
  private pois: TimeRefreshedDataHolder<Set<string>>
  private denylistedNames: TimeRefreshedDataHolder<Set<string>>

  constructor(ethereumProvider: HTTPProvider) {
    this.servers = new TimeRefreshedDataHolder(() => getServers(ethereumProvider), REFRESH_TIME)
    this.pois = new TimeRefreshedDataHolder(() => getPois(ethereumProvider), REFRESH_TIME)
    this.denylistedNames = new TimeRefreshedDataHolder(() => getBannedNames(ethereumProvider), REFRESH_TIME)
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
