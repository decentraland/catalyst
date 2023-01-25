import { ComponentsBuilder } from '../../src/types'
import * as sinon from 'sinon'
import { HTTPProvider } from 'eth-connect'
import { L1Checker, L2Checker } from '@dcl/content-validator'

export function createTestComponentBuilder(): ComponentsBuilder {
  return {
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
