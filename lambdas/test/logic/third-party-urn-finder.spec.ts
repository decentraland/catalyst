import { findThirdPartyItemUrns } from '../../src/logic/third-party-urn-finder'
import { ThirdPartyAssetFetcher } from '../../src/ports/third-party/third-party-fetcher'

const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
const TPW_WEARABLE_ID = 'urn:decentraland:mumbai:collections-thirdparty:some-third-party:someWearable'

describe('findItemUrns', () => {
  describe('when resolver and assets exist for the owner', () => {
    let expectedRegistryId: string
    let expectedOwner: string
    let tpFetcher: ThirdPartyAssetFetcher
    let mockedGraphClient: { findThirdPartyResolver: jest.Mock }

    beforeEach(() => {
      expectedRegistryId = 'some-third-party'
      expectedOwner = SOME_ADDRESS
      tpFetcher = {
        fetchAssets: (url, registryId, owner) => {
          const assets =
            registryId === expectedRegistryId && owner === expectedOwner
              ? [
                  {
                    id: TPW_WEARABLE_ID,
                    amount: 1,
                    urn: { decentraland: TPW_WEARABLE_ID }
                  }
                ]
              : []
          return Promise.resolve(assets)
        }
      }
      mockedGraphClient = {
        findThirdPartyResolver: jest.fn().mockResolvedValue('some-url')
      }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return the correct urn', async () => {
      const wearableUrns = await findThirdPartyItemUrns(
        mockedGraphClient as any,
        tpFetcher,
        SOME_ADDRESS,
        'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
      )

      expect(wearableUrns.length).toEqual(1)
      expect(wearableUrns[0]).toEqual(TPW_WEARABLE_ID)
      expect(mockedGraphClient.findThirdPartyResolver).toHaveBeenCalledWith(
        'thirdPartyRegistrySubgraph',
        'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
      )
    })
  })

  describe('when the resolver does not exist', () => {
    let expectedRegistryId: string
    let collectionId: string
    let expectedOwner: string
    let tpFetcher: ThirdPartyAssetFetcher
    let mockedGraphClient: { findThirdPartyResolver: jest.Mock }

    beforeEach(() => {
      expectedRegistryId = 'some-third-party'
      collectionId = 'urn:decentraland:mumbai:collections-thirdparty:' + expectedRegistryId
      expectedOwner = SOME_ADDRESS
      tpFetcher = {
        fetchAssets: (url, registryId, owner) => {
          const assets =
            registryId === expectedRegistryId && owner === expectedOwner
              ? [
                  {
                    id: TPW_WEARABLE_ID,
                    amount: 1,
                    urn: { decentraland: TPW_WEARABLE_ID }
                  }
                ]
              : []
          return Promise.resolve(assets)
        }
      }
      mockedGraphClient = {
        findThirdPartyResolver: jest.fn().mockResolvedValue(undefined)
      }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should reject with error', async () => {
      await expect(
        findThirdPartyItemUrns(mockedGraphClient as any, tpFetcher, SOME_ADDRESS, collectionId)
      ).rejects.toThrow(`Could not find third party resolver for collectionId: ${collectionId}`)
    })
  })

  describe('when the fetcher returns assets from another thirdparty', () => {
    let tpFetcher: ThirdPartyAssetFetcher
    let mockedGraphClient: { findThirdPartyResolver: jest.Mock }

    beforeEach(() => {
      tpFetcher = {
        fetchAssets: () => {
          return Promise.resolve([
            {
              id: TPW_WEARABLE_ID,
              amount: 1,
              urn: { decentraland: TPW_WEARABLE_ID }
            },
            {
              id: TPW_WEARABLE_ID,
              amount: 1,
              urn: { decentraland: 'wrongUrn!' }
            }
          ])
        }
      }
      mockedGraphClient = {
        findThirdPartyResolver: jest.fn().mockResolvedValue('some-url')
      }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should filter them out', async () => {
      const wearableUrns = await findThirdPartyItemUrns(
        mockedGraphClient as any,
        tpFetcher,
        SOME_ADDRESS,
        'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
      )

      expect(wearableUrns.length).toEqual(1)
      expect(wearableUrns[0]).toEqual(TPW_WEARABLE_ID)
      expect(mockedGraphClient.findThirdPartyResolver).toHaveBeenCalledWith(
        'thirdPartyRegistrySubgraph',
        'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
      )
    })
  })
})
