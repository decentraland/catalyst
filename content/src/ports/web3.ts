import { HTTPProvider } from 'eth-connect'
import { ethers } from 'ethers'
import { EnvironmentConfig } from 'src/Environment'
import { AppComponents } from 'src/types'

export type IWeb3Component = {
  getL1EthConnectProvider(): HTTPProvider
  getL2EthConnectProvider(): HTTPProvider
  getL1EthersProvider(): ethers.providers.Provider
  getL2EthersProvider(): ethers.providers.Provider
}

export function createWeb3Component(components: Pick<AppComponents, 'env' | 'logs' | 'fetcher'>): IWeb3Component {
  const { fetcher, env } = components

  const ethNetwork: string = env.getConfig(EnvironmentConfig.ETH_NETWORK)

  let l1EthProvider: HTTPProvider | null = null
  function getL1EthConnectProvider(): HTTPProvider {
    if (!l1EthProvider) {
      l1EthProvider = new HTTPProvider(
        `https://rpc.decentraland.org/${encodeURIComponent(ethNetwork)}?project=catalyst-content`,
        {
          fetch: fetcher.fetch
        }
      )
    }
    return l1EthProvider
  }

  let l2EthProvider: HTTPProvider | null = null
  function getL2EthConnectProvider(): HTTPProvider {
    if (!l2EthProvider) {
      l2EthProvider = new HTTPProvider(
        ethNetwork === 'mainnet'
          ? `https://rpc.decentraland.org/polygon?project=catalyst-content`
          : `https://rpc.decentraland.org/mumbai?project=catalyst-content`,
        {
          fetch: fetcher.fetch
        }
      )
    }
    return l2EthProvider
  }

  let l1EthersProvider: ethers.providers.Provider | null = null
  function getL1EthersProvider(): ethers.providers.Provider {
    if (!l1EthersProvider) {
      l1EthersProvider = new ethers.providers.JsonRpcProvider(
        `https://rpc.decentraland.org/${encodeURIComponent(ethNetwork)}?project=catalyst-content`
      )
    }
    return l1EthersProvider
  }

  let l2EthersProvider: ethers.providers.Provider | null = null
  function getL2EthersProvider(): ethers.providers.Provider {
    if (!l2EthersProvider) {
      l2EthersProvider = new ethers.providers.JsonRpcProvider(
        ethNetwork === 'mainnet'
          ? `https://rpc.decentraland.org/polygon?project=catalyst-content`
          : `https://rpc.decentraland.org/mumbai?project=catalyst-content`
      )
    }
    return l2EthersProvider
  }

  return {
    getL1EthConnectProvider,
    getL2EthConnectProvider,
    getL1EthersProvider,
    getL2EthersProvider
  }
}
