import { CatalystByIdResult, catalystDeployments, catalystAbiItems } from '@dcl/catalyst-contracts'
import { ethers } from 'ethers'
import { arrayify } from 'ethers/lib/utils'
import { providers } from '@0xsequence/multicall'

export interface DaoComponent {
  getAllContentServers(): Promise<Array<CatalystByIdResult>>
  getAllServers(): Promise<Array<CatalystByIdResult>>
}

export class DAOClient implements DaoComponent {
  constructor(private provider: ethers.providers.Provider) {}

  async getAllContentServers(): Promise<Array<CatalystByIdResult>> {
    const servers = await this.getAllServers()
    return servers.map((server) => ({ ...server, domain: server.domain + '/content' }))
  }

  async getAllServers(): Promise<Array<CatalystByIdResult>> {
    const networkId = (await this.provider.getNetwork())['chainId'].toString()

    if (!(networkId in catalystDeployments)) {
      throw new Error(`There is no deployed CatalystProxy contract for networkId=${networkId}`)
    }
    const contractAddress = (catalystDeployments as any)[networkId]

    const provider = new providers.MulticallProvider(this.provider)
    const contract = new ethers.Contract(contractAddress, catalystAbiItems as any, provider)

    const count = (await contract.catalystCount()).toNumber()
    const nodes: CatalystByIdResult[] = []
    const ids = await Promise.all(new Array(count).fill(0).map((_, i) => contract.catalystIds(i)))
    const data = await Promise.all(ids.map((id: string) => contract.catalystById(id)))

    for (const node of data) {
      const [id, owner, _] = node
      let domain = node[2]
      if (domain.startsWith('http://')) {
        console.warn(`Catalyst node domain using http protocol, skipping ${JSON.stringify(domain)}`)
        continue
      }

      if (!domain.startsWith('https://')) {
        domain = 'https://' + domain
      }

      // trim url in case it starts/ends with a blank
      domain = domain.trim()

      nodes.push({ id, owner, domain })
    }

    return nodes
  }
}

export class DAOHardcodedClient implements DaoComponent {
  constructor(private readonly servers: string[]) {}

  async getAllContentServers(): Promise<Array<CatalystByIdResult>> {
    const servers = await this.getAllServers()
    return servers.map((server) => ({ ...server, address: server.domain + '/content' }))
  }

  async getAllServers(): Promise<Array<CatalystByIdResult>> {
    return this.servers.map((server, index) => ({
      domain: server,
      owner: '0x0000000000000000000000000000000000000000',
      id: arrayify(`${index.toString(16)}`)
    }))
  }
}
