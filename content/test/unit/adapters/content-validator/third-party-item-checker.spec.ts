import fs from 'fs'
import os from 'os'
import path from 'path'
import { createThirdPartyItemChecker, ContractType } from '../../../../src/adapters/content-validator/third-party-item-checker'
import { ThirdPartyItemChecker } from '@dcl/content-validator'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createHttpProviderMock } from '../../../mocks/http-provider-mock'

const ETH_ADDRESS = '0x49f94A887Efc16993E69d4F07Ef3dE11A2C90897'
const OTHER_ADDRESS = '0x69d30b1875d39e13a01af73ccfed6d84839e84f2'
const ERC721_CONTRACT = '0x74c78f5a4ab22f01d5fd08455cf0ff5c3367535c'
const ERC1155_CONTRACT = '0x1aca797764bd5c1e9f3c2933432a2be770a33941'
const UNKNOWN_CONTRACT = '0x7020117712a3fe09b7162ee3f932dae7673c6bdd'
const NETWORK = 'amoy' as const
const BLOCK = 6417273

function tpUrn(contract: string, nftId: string | number): string {
  return `urn:decentraland:amoy:collections-thirdparty:back-to-the-future:sepolia-8a50:f-bananacrown-4685:sepolia:${contract}:${nftId}`
}

/** Encode an address as a 32-byte right-aligned hex word, the format `ownerOf` returns. */
function encodeAddress(address: string): string {
  const addr = address.toLowerCase().replace(/^0x/, '')
  return '0x' + '0'.repeat(64 - addr.length) + addr
}

/** Encode a uint256 as a 32-byte hex word, the format `balanceOf` returns. */
function encodeUint256(value: number): string {
  const hex = value.toString(16)
  return '0x' + '0'.repeat(64 - hex.length) + hex
}

function rpcOk(id: number, result: string) {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id: number) {
  return { jsonrpc: '2.0', id, error: { code: 3, data: '0x', message: 'execution reverted' } }
}

function seedClassifications(storageRoot: string, classifications: Record<string, ContractType>) {
  fs.writeFileSync(path.join(storageRoot, `third-party-contracts-${NETWORK}.json`), JSON.stringify(classifications))
}

function readClassifications(storageRoot: string): Record<string, ContractType> {
  return JSON.parse(fs.readFileSync(path.join(storageRoot, `third-party-contracts-${NETWORK}.json`), 'utf-8'))
}

describe('when checking third party items', () => {
  let logs: ILoggerComponent
  let storageRoot: string

  beforeEach(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-checker-'))
  })

  afterEach(() => {
    fs.rmSync(storageRoot, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  describe('and the input list is empty', () => {
    let checker: ThirdPartyItemChecker

    beforeEach(async () => {
      checker = await createThirdPartyItemChecker({ logs }, createHttpProviderMock([]), NETWORK, storageRoot)
    })

    it('should return an empty array', async () => {
      expect(await checker.checkThirdPartyItems(ETH_ADDRESS, [], BLOCK)).toEqual([])
    })
  })

  describe('and a URN cannot be parsed', () => {
    let checker: ThirdPartyItemChecker

    beforeEach(async () => {
      // The component still issues an (empty) RPC batch after the unparseable URN is marked false.
      checker = await createThirdPartyItemChecker({ logs }, createHttpProviderMock([[]]), NETWORK, storageRoot)
    })

    it('should mark the unparseable URN as not owned', async () => {
      const result = await checker.checkThirdPartyItems(ETH_ADDRESS, ['urn:decentraland:invalid:not-a-real-urn'], BLOCK)
      expect(result).toEqual([false])
    })
  })

  describe('and the contract is already classified as unknown', () => {
    let checker: ThirdPartyItemChecker

    beforeEach(async () => {
      seedClassifications(storageRoot, { [UNKNOWN_CONTRACT]: ContractType.UNKNOWN })
      checker = await createThirdPartyItemChecker({ logs }, createHttpProviderMock([[]]), NETWORK, storageRoot)
    })

    it('should mark the URN as not owned', async () => {
      const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(UNKNOWN_CONTRACT, '1')], BLOCK)
      expect(result).toEqual([false])
    })
  })

  describe('and the contract is already classified as ERC-721', () => {
    beforeEach(() => {
      seedClassifications(storageRoot, { [ERC721_CONTRACT]: ContractType.ERC721 })
    })

    describe('and the queried address owns the token', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcOk(1, encodeAddress(ETH_ADDRESS))]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
      })

      it('should return true', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC721_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([true])
      })
    })

    describe('and a different address owns the token', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcOk(1, encodeAddress(OTHER_ADDRESS))]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
      })

      it('should return false', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC721_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([false])
      })
    })

    describe('and the RPC call returns an error', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcError(1)]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
      })

      it('should return false', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC721_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([false])
      })
    })

    describe('and the RPC call returns an empty result', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcOk(1, '0x')]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
      })

      it('should return false', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC721_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([false])
      })
    })
  })

  describe('and the contract is already classified as ERC-1155', () => {
    beforeEach(() => {
      seedClassifications(storageRoot, { [ERC1155_CONTRACT]: ContractType.ERC1155 })
    })

    describe('and the queried address has a positive balance', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcOk(1, encodeUint256(3))]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
      })

      it('should return true', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC1155_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([true])
      })
    })

    describe('and the queried address has a zero balance', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcOk(1, encodeUint256(0))]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
      })

      it('should return false', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC1155_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([false])
      })
    })

    describe('and the RPC call returns an empty result', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcOk(1, '0x')]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
      })

      it('should treat the missing balance as zero and return false', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC1155_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([false])
      })
    })

    describe('and the RPC call returns an error', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcError(1)]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
      })

      it('should return false', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC1155_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([false])
      })
    })
  })

  describe('and the input is a mixed batch of parseable, unparseable, and pre-classified URNs', () => {
    const urns = [
      'urn:decentraland:invalid:not-a-real-urn',
      tpUrn(UNKNOWN_CONTRACT, '1'),
      tpUrn(ERC721_CONTRACT, '7'),
      tpUrn(ERC1155_CONTRACT, '5')
    ]
    let result: boolean[]

    beforeEach(async () => {
      seedClassifications(storageRoot, {
        [UNKNOWN_CONTRACT]: ContractType.UNKNOWN,
        [ERC721_CONTRACT]: ContractType.ERC721,
        [ERC1155_CONTRACT]: ContractType.ERC1155
      })
      // Two RPC responses for the two known contracts: one ownerOf hit + one balanceOf hit.
      const httpProvider = createHttpProviderMock([
        [rpcOk(1, encodeAddress(ETH_ADDRESS)), rpcOk(2, encodeUint256(2))]
      ])
      const checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
      result = await checker.checkThirdPartyItems(ETH_ADDRESS, urns, BLOCK)
    })

    it('should return one boolean per input URN', () => {
      expect(result).toHaveLength(urns.length)
    })

    it('should preserve the input order in the result', () => {
      expect(result).toEqual([false, false, true, true])
    })
  })

  describe('and a contract is not yet classified', () => {
    describe('and the classification RPCs identify it as ERC-1155', () => {
      let httpProvider: ReturnType<typeof createHttpProviderMock>

      beforeEach(async () => {
        // First call: checkIfErc1155 → balanceOf returns non-zero → classified ERC1155
        // (no need to check ERC721; classification short-circuits)
        // Second call: the ownership batch (one balanceOf with non-zero balance → true)
        httpProvider = createHttpProviderMock([
          [rpcOk(1, encodeUint256(1))],
          [rpcOk(2, encodeUint256(5))]
        ])
        const checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
        await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC1155_CONTRACT, '1')], BLOCK)
      })

      it('should persist the classification to the on-disk cache file', () => {
        expect(readClassifications(storageRoot)).toEqual({ [ERC1155_CONTRACT]: ContractType.ERC1155 })
      })
    })

    describe('and the classification RPCs identify it as ERC-721', () => {
      let httpProvider: ReturnType<typeof createHttpProviderMock>

      beforeEach(async () => {
        // First call: checkIfErc1155 → returns empty → not 1155
        // Second call: checkIfErc721 → ownerOf reverts with code 3 → still classified ERC721
        // Third call: the ownership batch (ownerOf returns the queried address → true)
        httpProvider = createHttpProviderMock([
          [rpcOk(1, '0x')],
          [rpcError(2)],
          [rpcOk(3, encodeAddress(ETH_ADDRESS))]
        ])
        const checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
        await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC721_CONTRACT, '1')], BLOCK)
      })

      it('should persist the classification to the on-disk cache file', () => {
        expect(readClassifications(storageRoot)).toEqual({ [ERC721_CONTRACT]: ContractType.ERC721 })
      })
    })

    describe('and neither classification RPC succeeds', () => {
      let httpProvider: ReturnType<typeof createHttpProviderMock>

      beforeEach(async () => {
        // checkIfErc1155 → empty result → not 1155.
        // checkIfErc721 → empty result → not 721.
        // No ownership batch goes out because the unknown short-circuits to false (but the
        // component still calls sendBatch with an empty batch — feed it [] to keep the mock happy).
        httpProvider = createHttpProviderMock([[rpcOk(1, '0x')], [rpcOk(2, '0x')], []])
        const checker = await createThirdPartyItemChecker({ logs }, httpProvider, NETWORK, storageRoot)
        await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(UNKNOWN_CONTRACT, '1')], BLOCK)
      })

      it('should persist the contract as UNKNOWN in the on-disk cache file', () => {
        expect(readClassifications(storageRoot)).toEqual({ [UNKNOWN_CONTRACT]: ContractType.UNKNOWN })
      })
    })
  })
})
