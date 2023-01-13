import { IWeb3Component } from 'src/ports/web3'
import * as sinon from 'sinon'

export function createMockWeb3Component(): IWeb3Component {
  return {
    getL1EthConnectProvider: () => sinon.fake(),
    getL2EthConnectProvider: () => sinon.fake(),
    getL1EthersProvider: () => sinon.fake(),
    getL2EthersProvider: () => sinon.fake()
  } as any
}
