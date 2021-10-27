import { Address } from 'web3x/address'
import { Eth } from 'web3x/eth'
import { HttpProvider } from 'web3x/providers'
import { Catalyst } from './Catalyst'
import { List } from './List'

export const networks = {
  ropsten: {
    wss: 'wss://ropsten.infura.io/ws/v3/65b4470058624aa493c1944328b19ec0',
    http: 'https://ropsten.infura.io/v3/65b4470058624aa493c1944328b19ec0',
    contracts: {
      catalyst: {
        address: '0xadd085f2318e9678bbb18b3e0711328f902b374b',
        class: Catalyst
      },
      POIs: {
        address: '0x5DC4a5C214f2161F0D5595a6dDd9352409aE3Ab4',
        class: List
      },
      denylistedNames: {
        address: '0x20c6f1e86eba703a14414a0cbc1b55c89dba7a0f',
        class: List
      }
    }
  },
  mainnet: {
    wss: 'wss://mainnet.infura.io/ws/v3/65b4470058624aa493c1944328b19ec0',
    http: 'https://mainnet.infura.io/v3/65b4470058624aa493c1944328b19ec0',
    contracts: {
      catalyst: {
        address: '0x4a2f10076101650f40342885b99b6b101d83c486',
        class: Catalyst
      },
      POIs: {
        address: '0x0ef15a1c7a49429a36cb46d4da8c53119242b54e',
        class: List
      },
      denylistedNames: {
        address: '0x0c4c90a4f29872a2e9ef4c4be3d419792bca9a36',
        class: List
      }
    }
  }
}

export function handlerForNetwork(networkKey: string, contractKey: string) {
  try {
    const provider = httpProviderForNetwork(networkKey)
    const eth = new Eth(provider)
    const network = networks[networkKey]
    const contract = network.contracts[contractKey]
    const address = Address.fromString(contract.address)
    const contractInstance = new contract.class(eth, address)

    return {
      provider,
      network,
      contract: contractInstance
    }
  } catch (error) {
    return undefined
  }
}

export function httpProviderForNetwork(networkKey: string) {
  const network = networks[networkKey]
  const url = network.http
  return new HttpProvider(url)
}
