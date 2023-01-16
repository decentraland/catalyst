import { ComponentsBuilder, EthersProvider } from '../../src/types'
import * as sinon from 'sinon'
import { IFetchComponent } from '@well-known-components/http-server'
import { HTTPProvider } from 'eth-connect'
import { L1Checker, L2Checker } from '@dcl/content-validator'

export function createTestComponentBuilder(): ComponentsBuilder {
  return {
    createEthConnectProvider(_fetcher: IFetchComponent, _network: string): HTTPProvider {
      return sinon.stub() as any
    },
    createEthersProvider(_network: string): Promise<EthersProvider> {
      return Promise.resolve({
        getBlockNumber: sinon.stub(),
        getBlock: sinon.stub()
      })
    },
    createL1Checker(_provider: EthersProvider, _network: string): Promise<L1Checker> {
      return Promise.resolve({
        checkLAND: sinon.stub(),
        checkNames: sinon.stub()
      })
    },
    createL2Checker(_provider: EthersProvider, _network: string): Promise<L2Checker> {
      return Promise.resolve(sinon.stub() as any)
    }
  }
}
