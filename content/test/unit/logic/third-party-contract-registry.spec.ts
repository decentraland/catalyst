import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createHttpProviderMock } from '../../mocks/http-provider-mock'
import { HTTPProvider } from 'eth-connect'
import {
  createThirdPartyContractRegistry,
  ThirdPartyContractRegistry
} from '../../../src/logic/third-party-contract-registry'
import path from 'path'
import fs from 'fs'
import os from 'os'

describe('third party contract registry', () => {
  let logs: ILoggerComponent
  let httpProvider: HTTPProvider
  let registry: ThirdPartyContractRegistry
  let tempFolder: string

  beforeEach(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
    httpProvider = createHttpProviderMock([
      [{ jsonrpc: '2.0', id: 1, result: '0x' }],
      [{ jsonrpc: '2.0', id: 2, result: '0x' }],
      [{ jsonrpc: '2.0', id: 3, error: { code: -32000, message: 'execution reverted' } }],
      [{ jsonrpc: '2.0', id: 4, result: '0x000000000000000000000000edae96f7739af8a7fb16e2a888c1e578e1328299' }],
      [{ jsonrpc: '2.0', id: 5, result: '0x0000000000000000000000000000000000000000000000000000000000000000' }]
    ])
    tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'))

    registry = await createThirdPartyContractRegistry(logs, httpProvider, 'sepolia', tempFolder)
  })

  afterEach(() => {
    fs.rm(tempFolder, { recursive: true }, () => {})
  })

  it('correct validation of nfts', async () => {
    await registry.ensureContractsKnown([
      '0x49f94A887Efc16993E69d4F07Ef3dE11A2C90897',
      '0x74c78f5a4ab22f01d5fd08455cf0ff5c3367535c',
      '0x1aca797764bd5c1e9F3c2933432a2be770A33941'
    ])

    expect(registry.isErc1155('0x1aca797764bd5c1e9f3c2933432a2be770a33941')).toBe(true)
    expect(registry.isErc1155('0x49f94A887Efc16993E69d4F07Ef3dE11A2C90897')).toBe(false)
    expect(registry.isErc1155('0x74c78f5a4ab22f01d5fd08455cf0ff5c3367535c')).toBe(false)

    expect(registry.isErc721('0x1aca797764bd5c1e9f3c2933432a2be770a33941')).toBe(false)
    expect(registry.isErc721('0x49f94A887Efc16993E69d4F07Ef3dE11A2C90897')).toBe(false)
    expect(registry.isErc721('0x74c78f5a4ab22f01d5fd08455cf0ff5c3367535c')).toBe(true)

    expect(registry.isUnknown('0x1aca797764bd5c1e9f3c2933432a2be770a33941')).toBe(false)
    expect(registry.isUnknown('0x49f94A887Efc16993E69d4F07Ef3dE11A2C90897')).toBe(true)
    expect(registry.isUnknown('0x74c78f5a4ab22f01d5fd08455cf0ff5c3367535c')).toBe(false)
  })
})
