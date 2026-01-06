import { EntityType } from '@dcl/schemas'
import {
  getWearablesByOwner,
  getWearablesByOwnerFromUrns
} from '../../../../../src/apis/collections/controllers/wearables'
import * as tpUrnFinder from '../../../../../src/logic/third-party-urn-finder'
import { createTheGraphClient } from '../../../../../src/ports/the-graph-client'
import { ThirdPartyAssetFetcher } from '../../../../../src/ports/third-party/third-party-fetcher'
import { SmartContentClient } from '../../../../../src/utils/SmartContentClient'

const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
const WEARABLE_ID_1 = 'someCollection-someWearable'
const WEARABLE_ID_2 = 'someOtherCollection-someOtherWearable'
const TPW_WEARABLE_ID = 'urn:decentraland:mumbai:collections-thirdparty:some-third-party:someWearable'

describe('getWearablesByOwnerFromUrns', () => {
  describe(`when user doesn't have any wearables`, () => {
    let contentClientMock: jest.Mocked<SmartContentClient>

    beforeEach(() => {
      contentClientMock = {
        fetchEntitiesByPointers: jest.fn()
      } as unknown as jest.Mocked<SmartContentClient>
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it(`should return empty response`, async () => {
      const wearables = await getWearablesByOwnerFromUrns(false, contentClientMock, [])

      expect(wearables.length).toEqual(0)
      expect(contentClientMock.fetchEntitiesByPointers).not.toHaveBeenCalled()
    })
  })

  describe('when user has repeated wearables', () => {
    let contentClientMock: jest.Mocked<SmartContentClient>

    beforeEach(() => {
      contentClientMock = {
        fetchEntitiesByPointers: jest.fn()
      } as unknown as jest.Mocked<SmartContentClient>
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should group them together', async () => {
      const wearables = await getWearablesByOwnerFromUrns(false, contentClientMock, [
        WEARABLE_ID_1,
        WEARABLE_ID_1,
        WEARABLE_ID_2
      ])

      expect(wearables.length).toEqual(2)
      const [wearable1, wearable2] = wearables
      expect(wearable1.urn).toBe(WEARABLE_ID_1)
      expect(wearable1.amount).toBe(2)
      expect(wearable1.definition).toBeUndefined()
      expect(wearable2.urn).toBe(WEARABLE_ID_2)
      expect(wearable2.amount).toBe(1)
      expect(wearable2.definition).toBeUndefined()
      expect(contentClientMock.fetchEntitiesByPointers).not.toHaveBeenCalled()
    })
  })

  describe('when user requests definitions', () => {
    let mockedClient: jest.Mocked<SmartContentClient>
    let wearableUrns: string[]
    let wearableMetadata: any

    beforeEach(() => {
      wearableUrns = [WEARABLE_ID_1]
      wearableMetadata = {
        id: WEARABLE_ID_1,
        someProperty: 'someValue',
        data: { representations: [] },
        image: undefined,
        thumbnail: undefined
      }
      mockedClient = {
        fetchEntitiesByPointers: jest.fn().mockResolvedValue([
          {
            version: 'v3',
            id: 'someId',
            type: EntityType.WEARABLE,
            pointers: wearableUrns,
            timestamp: 10,
            content: [],
            metadata: wearableMetadata
          }
        ])
      } as unknown as jest.Mocked<SmartContentClient>
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should include them in the response', async () => {
      const wearables = await getWearablesByOwnerFromUrns(true, mockedClient, wearableUrns)

      expect(wearables.length).toEqual(1)
      const [wearable] = wearables
      expect(wearable.urn).toBe(WEARABLE_ID_1)
      expect(wearable.amount).toBe(1)
      expect(wearable.definition).toEqual(wearableMetadata)
      expect(mockedClient.fetchEntitiesByPointers).toHaveBeenCalledWith(wearableUrns)
      expect(mockedClient.fetchEntitiesByPointers).toHaveBeenCalledTimes(1)
    })
  })

  describe(`when wearable can't be found`, () => {
    let contentClientMock: jest.Mocked<SmartContentClient>
    let wearableUrns: string[]

    beforeEach(() => {
      wearableUrns = [WEARABLE_ID_1]
      contentClientMock = {
        fetchEntitiesByPointers: jest.fn().mockResolvedValue([])
      } as unknown as jest.Mocked<SmartContentClient>
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it(`should not return the definition`, async () => {
      const wearables = await getWearablesByOwnerFromUrns(true, contentClientMock, wearableUrns)

      expect(wearables.length).toEqual(1)
      const [wearable] = wearables
      expect(wearable.urn).toBe(WEARABLE_ID_1)
      expect(wearable.amount).toBe(1)
      expect(wearable.definition).toBeUndefined()
      expect(contentClientMock.fetchEntitiesByPointers).toHaveBeenCalledWith(wearableUrns)
      expect(contentClientMock.fetchEntitiesByPointers).toHaveBeenCalledTimes(1)
    })
  })
})

describe('getWearablesByOwner', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when collectionId is defined', () => {
    let contentClientMock: jest.Mocked<SmartContentClient>
    let mockedGraphClient: { findWearableUrnsByOwner: jest.Mock }
    let tpFetcher: ThirdPartyAssetFetcher

    beforeEach(() => {
      contentClientMock = {
        fetchEntitiesByPointers: jest.fn()
      } as unknown as jest.Mocked<SmartContentClient>
      mockedGraphClient = {
        findWearableUrnsByOwner: jest.fn()
      }
      tpFetcher = {
        fetchAssets: () =>
          Promise.resolve([
            {
              id: TPW_WEARABLE_ID,
              amount: 1,
              urn: { decentraland: TPW_WEARABLE_ID }
            }
          ])
      }
      jest.spyOn(tpUrnFinder, 'findThirdPartyItemUrns').mockResolvedValue([TPW_WEARABLE_ID])
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should fetch assets from the third party', async () => {
      const wearables = await getWearablesByOwner(
        false,
        contentClientMock,
        mockedGraphClient as any,
        tpFetcher,
        'some-collection',
        SOME_ADDRESS
      )

      expect(wearables.length).toEqual(1)
      expect(wearables[0].amount).toEqual(1)
      expect(wearables[0].urn).toEqual(TPW_WEARABLE_ID)
      expect(wearables[0].definition).toBeUndefined()
      expect(mockedGraphClient.findWearableUrnsByOwner).not.toHaveBeenCalled()
      expect(contentClientMock.fetchEntitiesByPointers).not.toHaveBeenCalled()
    })
  })

  describe('when collectionId is undefined', () => {
    let contentClientMock: jest.Mocked<SmartContentClient>
    let mockedGraphClient: { findWearableUrnsByOwner: jest.Mock }
    let tpFetcher: { fetchAssets: jest.Mock }
    let tpUrnFinderSpy: jest.SpyInstance

    beforeEach(() => {
      contentClientMock = {
        fetchEntitiesByPointers: jest.fn()
      } as unknown as jest.Mocked<SmartContentClient>
      mockedGraphClient = {
        findWearableUrnsByOwner: jest.fn().mockResolvedValue([WEARABLE_ID_1])
      }
      tpFetcher = { fetchAssets: jest.fn() }
      tpUrnFinderSpy = jest.spyOn(tpUrnFinder, 'findThirdPartyItemUrns').mockResolvedValue([])
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should fetch assets from the graph client', async () => {
      const wearables = await getWearablesByOwner(
        false,
        contentClientMock,
        mockedGraphClient as any,
        tpFetcher,
        undefined,
        SOME_ADDRESS
      )

      expect(wearables.length).toEqual(1)
      expect(wearables[0].amount).toEqual(1)
      expect(wearables[0].urn).toEqual(WEARABLE_ID_1)
      expect(wearables[0].definition).toBeUndefined()
      expect(mockedGraphClient.findWearableUrnsByOwner).toHaveBeenCalledWith(SOME_ADDRESS)
      expect(mockedGraphClient.findWearableUrnsByOwner).toHaveBeenCalledTimes(1)
      expect(contentClientMock.fetchEntitiesByPointers).not.toHaveBeenCalled()
      expect(tpUrnFinderSpy).not.toHaveBeenCalled()
    })
  })

  describe('when verifying the graph client is called with the correct arguments', () => {
    let contentClientMock: jest.Mocked<SmartContentClient>
    let subGraphs: {
      ensSubgraph: { query: jest.Mock }
      collectionsSubgraph: { query: jest.Mock }
      maticCollectionsSubgraph: { query: jest.Mock }
      thirdPartyRegistrySubgraph: { query: jest.Mock }
    }
    let tpFetcher: { fetchAssets: jest.Mock }
    let tpUrnFinderSpy: jest.SpyInstance

    beforeEach(() => {
      contentClientMock = {
        fetchEntitiesByPointers: jest.fn()
      } as unknown as jest.Mocked<SmartContentClient>
      subGraphs = {
        ensSubgraph: { query: jest.fn() },
        collectionsSubgraph: { query: jest.fn() },
        maticCollectionsSubgraph: { query: jest.fn() },
        thirdPartyRegistrySubgraph: { query: jest.fn() }
      }
      subGraphs.collectionsSubgraph.query.mockResolvedValue({
        nfts: [
          {
            id: 'im an id',
            urn: WEARABLE_ID_1,
            collection: {
              isApproved: true
            }
          }
        ]
      })
      subGraphs.maticCollectionsSubgraph.query.mockResolvedValue({
        nfts: [
          {
            id: 'im an id',
            urn: WEARABLE_ID_1,
            collection: {
              isApproved: true
            }
          }
        ]
      })
      tpFetcher = { fetchAssets: jest.fn() }
      tpUrnFinderSpy = jest.spyOn(tpUrnFinder, 'findThirdPartyItemUrns').mockResolvedValue([])
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should call the graph client with the arguments correctly mapped', async () => {
      const query = `
query itemsByOwner($owner: String, $item_types:[String], $first: Int, $start: String) {
  nfts(where: {owner: $owner, searchItemType_in: $item_types, id_gt: $start}, first: $first) {
    id
    urn
    collection {
      isApproved
    }
  }
}`
      const expectedVariables = {
        owner: SOME_ADDRESS,
        item_types: ['wearable_v1', 'wearable_v2', 'smart_wearable_v1'],
        first: 1000,
        start: ''
      }

      const graphClient = await createTheGraphClient({
        subgraphs: subGraphs,
        log: {
          getLogger: () => ({
            debug: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            log: jest.fn(),
            warn: jest.fn()
          })
        }
      })

      const wearables = await getWearablesByOwner(
        false,
        contentClientMock,
        graphClient as any,
        tpFetcher,
        undefined,
        SOME_ADDRESS
      )

      expect(wearables.length).toEqual(1)
      expect(wearables[0].amount).toEqual(2)
      expect(wearables[0].urn).toEqual(WEARABLE_ID_1)
      expect(wearables[0].definition).toBeUndefined()
      expect(subGraphs.collectionsSubgraph.query).toHaveBeenCalledTimes(1)
      expect(subGraphs.collectionsSubgraph.query).toHaveBeenCalledWith(query, expectedVariables)
      expect(subGraphs.maticCollectionsSubgraph.query).toHaveBeenCalledTimes(1)
      expect(subGraphs.maticCollectionsSubgraph.query).toHaveBeenCalledWith(query, {
        first: 1000,
        item_types: ['wearable_v1', 'wearable_v2', 'smart_wearable_v1'],
        owner: '0x079bed9c31cb772c4c156f86e1cff15bf751add0',
        start: ''
      })
      expect(tpUrnFinderSpy).not.toHaveBeenCalled()
    })
  })
})
