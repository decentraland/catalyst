import { createThirdPartyItemChecker } from '../../../src/logic/third-party-item-checker'
import { ThirdPartyItemChecker } from '@dcl/content-validator'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createHttpProviderMock } from '../../mocks/http-provider-mock'
import { ThirdPartyContractRegistry } from '../../../src/logic/third-party-contract-registry'
import { createThirdPartyContractRegistryMock } from '../../mocks/third-party-registry-mock'

const ETH_ADDRESS = '0x49f94A887Efc16993E69d4F07Ef3dE11A2C90897'
const OTHER_ADDRESS = '0x69d30b1875d39e13a01af73ccfed6d84839e84f2'
const ERC721_CONTRACT = '0x74c78f5a4ab22f01d5fd08455cf0ff5c3367535c'
const ERC1155_CONTRACT = '0x1aca797764bd5c1e9f3c2933432a2be770a33941'
const UNKNOWN_CONTRACT = '0x7020117712a3fe09b7162ee3f932dae7673c6bdd'
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

describe('when checking third party items', () => {
  let logs: ILoggerComponent
  let registry: ThirdPartyContractRegistry

  beforeEach(async () => {
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
    registry = createThirdPartyContractRegistryMock()
    registry.isErc721 = jest.fn().mockReturnValue(false)
    registry.isErc1155 = jest.fn().mockReturnValue(false)
    registry.isUnknown = jest.fn().mockReturnValue(false)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and the input list is empty', () => {
    let checker: ThirdPartyItemChecker

    beforeEach(async () => {
      checker = await createThirdPartyItemChecker({ logs }, createHttpProviderMock([]), registry)
    })

    it('should return an empty array', async () => {
      expect(await checker.checkThirdPartyItems(ETH_ADDRESS, [], BLOCK)).toEqual([])
    })

    it('should not consult the contract registry', async () => {
      await checker.checkThirdPartyItems(ETH_ADDRESS, [], BLOCK)
      expect(registry.ensureContractsKnown).not.toHaveBeenCalled()
    })
  })

  describe('and a URN cannot be parsed', () => {
    let checker: ThirdPartyItemChecker

    beforeEach(async () => {
      // The component still issues an (empty) RPC batch after the unparseable URN is
      // marked false, so the mock needs to respond — even if the response is ignored.
      checker = await createThirdPartyItemChecker({ logs }, createHttpProviderMock([[]]), registry)
    })

    it('should mark the unparseable URN as not owned', async () => {
      const result = await checker.checkThirdPartyItems(ETH_ADDRESS, ['urn:decentraland:invalid:not-a-real-urn'], BLOCK)
      expect(result).toEqual([false])
    })
  })

  describe('and the contract is of an unknown type', () => {
    let checker: ThirdPartyItemChecker

    beforeEach(async () => {
      registry.isUnknown = jest.fn().mockImplementation((c) => c === UNKNOWN_CONTRACT)
      checker = await createThirdPartyItemChecker({ logs }, createHttpProviderMock([[]]), registry)
    })

    it('should mark the URN as not owned', async () => {
      const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(UNKNOWN_CONTRACT, '1')], BLOCK)
      expect(result).toEqual([false])
    })

    it('should ask the registry to ensure the contract is known', async () => {
      await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(UNKNOWN_CONTRACT, '1')], BLOCK)
      expect(registry.ensureContractsKnown).toHaveBeenCalledWith(expect.arrayContaining([UNKNOWN_CONTRACT]))
    })
  })

  describe('and the contract is an ERC-721', () => {
    beforeEach(() => {
      registry.isErc721 = jest.fn().mockImplementation((c) => c === ERC721_CONTRACT)
    })

    describe('and the queried address owns the token', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcOk(1, encodeAddress(ETH_ADDRESS))]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, registry)
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
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, registry)
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
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, registry)
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
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, registry)
      })

      it('should return false', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC721_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([false])
      })
    })
  })

  describe('and the contract is an ERC-1155', () => {
    beforeEach(() => {
      registry.isErc1155 = jest.fn().mockImplementation((c) => c === ERC1155_CONTRACT)
    })

    describe('and the queried address has a positive balance', () => {
      let checker: ThirdPartyItemChecker

      beforeEach(async () => {
        const httpProvider = createHttpProviderMock([[rpcOk(1, encodeUint256(3))]])
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, registry)
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
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, registry)
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
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, registry)
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
        checker = await createThirdPartyItemChecker({ logs }, httpProvider, registry)
      })

      it('should return false', async () => {
        const result = await checker.checkThirdPartyItems(ETH_ADDRESS, [tpUrn(ERC1155_CONTRACT, '1')], BLOCK)
        expect(result).toEqual([false])
      })
    })
  })

  describe('and the input is a mixed batch of parseable, unparseable, and unknown URNs', () => {
    const urns = [
      'urn:decentraland:invalid:not-a-real-urn',
      tpUrn(UNKNOWN_CONTRACT, '1'),
      tpUrn(ERC721_CONTRACT, '7'),
      tpUrn(ERC1155_CONTRACT, '5')
    ]
    let result: boolean[]

    beforeEach(async () => {
      registry.isErc721 = jest.fn().mockImplementation((c) => c === ERC721_CONTRACT)
      registry.isErc1155 = jest.fn().mockImplementation((c) => c === ERC1155_CONTRACT)
      registry.isUnknown = jest.fn().mockImplementation((c) => c === UNKNOWN_CONTRACT)
      // Only the parseable + known URNs reach the RPC batch (in input order):
      // index 2 → ERC-721 ownerOf (returns the queried address → owned)
      // index 3 → ERC-1155 balanceOf (returns 2 → owned)
      const httpProvider = createHttpProviderMock([
        [rpcOk(1, encodeAddress(ETH_ADDRESS)), rpcOk(2, encodeUint256(2))]
      ])
      const checker = await createThirdPartyItemChecker({ logs }, httpProvider, registry)
      result = await checker.checkThirdPartyItems(ETH_ADDRESS, urns, BLOCK)
    })

    it('should return one boolean per input URN', () => {
      expect(result).toHaveLength(urns.length)
    })

    it('should preserve the input order in the result', () => {
      expect(result).toEqual([false, false, true, true])
    })

    it('should ask the registry to ensure every parseable contract is known', () => {
      expect(registry.ensureContractsKnown).toHaveBeenCalledWith(
        expect.arrayContaining([UNKNOWN_CONTRACT, ERC721_CONTRACT, ERC1155_CONTRACT])
      )
    })
  })
})
