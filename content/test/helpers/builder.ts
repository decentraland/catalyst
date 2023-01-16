import { ComponentsBuilder } from '../../src/types'
import * as sinon from 'sinon'
import { IFetchComponent } from '@well-known-components/http-server'
import { HTTPProvider } from 'eth-connect'
import { L1Checker, L2Checker } from '@dcl/content-validator'
import { ethers } from 'ethers'

export function createTestComponentBuilder(): ComponentsBuilder {
  return {
    createEthConnectProvider(_fetcher: IFetchComponent, _network: string): HTTPProvider {
      return sinon.stub() as any
    },
    createEthersProvider(_network: string): ethers.providers.Provider {
      return {
        getBlockNumber: sinon.stub(),
        getBlock: sinon.stub()
      } as any
    },
    createL1Checker(_provider: ethers.providers.Provider, _network: string): L1Checker {
      return {
        checkLAND: sinon.stub(),
        checkNames: sinon.stub()
      }
    },
    createL2Checker(_provider: ethers.providers.Provider, _network: string): L2Checker {
      return sinon.stub() as any
    }
  }
}
