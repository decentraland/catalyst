import { ComponentsBuilder } from '../../src/types'
import * as sinon from 'sinon'
import { IFetchComponent } from '@well-known-components/http-server'
import { HTTPProvider } from 'eth-connect'
import { L1Checker, L2Checker } from '@dcl/content-validator'

export function createTestComponentBuilder(): ComponentsBuilder {
  return {
    createEthConnectProvider(_fetcher: IFetchComponent, _network: string): HTTPProvider {
      return sinon.stub() as any
    },
    createL1Checker(_provider: HTTPProvider, _network: string): Promise<L1Checker> {
      return Promise.resolve({
        checkLAND: sinon.stub(),
        checkNames: sinon.stub()
      })
    },
    createL2Checker(_provider: HTTPProvider, _network: string): Promise<L2Checker> {
      return Promise.resolve(sinon.stub() as any)
    }
  }
}
