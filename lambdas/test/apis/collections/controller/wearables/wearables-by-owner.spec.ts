import { EntityType } from '@dcl/schemas'
import { anything, instance, mock, verify, when } from 'ts-mockito'
import {
  getWearablesByOwner,
  getWearablesByOwnerFromUrns
} from '../../../../../src/apis/collections/controllers/wearables'
import * as tpUrnFinder from '../../../../../src/logic/third-party-urn-finder'
import { ThirdPartyAssetFetcher } from '../../../../../src/ports/third-party/third-party-fetcher'
import { SmartContentClient } from '../../../../../src/utils/SmartContentClient'
import { TheGraphClient } from '../../../../../src/utils/TheGraphClient'
import { ISubgraphComponent } from '@well-known-components/thegraph-component'

const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
const WEARABLE_ID_1 = 'someCollection-someWearable'
const WEARABLE_ID_2 = 'someOtherCollection-someOtherWearable'
const TPW_WEARABLE_ID = 'urn:decentraland:mumbai:collections-thirdparty:some-third-party:someWearable'

describe('getWearablesByOwnerFromUrns', () => {
  it(`When user doesn't have any wearables, then the response is empty`, async () => {
    const contentClientMock = mock(SmartContentClient)

    const wearables = await getWearablesByOwnerFromUrns(false, instance(contentClientMock), [])

    expect(wearables.length).toEqual(0)
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).never()
  })

  it('When user has repeated wearables, then they are grouped together', async () => {
    const contentClientMock = mock(SmartContentClient)

    const wearables = await getWearablesByOwnerFromUrns(false, instance(contentClientMock), [
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
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).never()
  })

  it('When user requests definitions, then they are included in the response', async () => {
    const mockedClient = mock(SmartContentClient)
    const wearableUrns = [WEARABLE_ID_1]
    const wearableMetadata = {
      id: WEARABLE_ID_1,
      someProperty: 'someValue',
      data: { representations: [] },
      image: undefined,
      thumbnail: undefined
    }
    when(mockedClient.fetchEntitiesByPointers(anything(), wearableUrns)).thenResolve([
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

    const wearables = await getWearablesByOwnerFromUrns(true, instance(mockedClient), wearableUrns)

    expect(wearables.length).toEqual(1)
    const [wearable] = wearables
    expect(wearable.urn).toBe(WEARABLE_ID_1)
    expect(wearable.amount).toBe(1)
    expect(wearable.definition).toEqual(wearableMetadata)
    verify(mockedClient.fetchEntitiesByPointers(anything(), wearableUrns)).once()
  })

  it(`When wearable can't be found, then the definition is not returned`, async () => {
    const contentClientMock = mock(SmartContentClient)
    when(contentClientMock.fetchEntitiesByPointers(anything(), anything())).thenResolve([])
    const wearableUrns = [WEARABLE_ID_1]
    const wearables = await getWearablesByOwnerFromUrns(true, instance(contentClientMock), wearableUrns)

    expect(wearables.length).toEqual(1)
    const [wearable] = wearables
    expect(wearable.urn).toBe(WEARABLE_ID_1)
    expect(wearable.amount).toBe(1)
    expect(wearable.definition).toBeUndefined()
    verify(contentClientMock.fetchEntitiesByPointers(EntityType.WEARABLE, wearableUrns)).once()
  })
})

describe('getWearablesByOwner', () => {
  beforeEach(() => jest.resetAllMocks())
  it('When collectionId is defined, then assets are fetched from the third party', async () => {
    const contentClientMock = mock(SmartContentClient)
    const mockedGraphClient = mock(TheGraphClient)

    const tpFetcher: ThirdPartyAssetFetcher = {
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

    const wearables = await getWearablesByOwner(
      false,
      instance(contentClientMock),
      instance(mockedGraphClient),
      tpFetcher,
      'some-collection',
      SOME_ADDRESS
    )

    expect(wearables.length).toEqual(1)
    expect(wearables[0].amount).toEqual(1)
    expect(wearables[0].urn).toEqual(TPW_WEARABLE_ID)
    expect(wearables[0].definition).toBeUndefined()
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).never()
    verify(mockedGraphClient.findWearableUrnsByOwner(anything())).never()
  })

  it('When collectionId is undefined, then assets are fetched from the graph client', async () => {
    const contentClientMock = mock(SmartContentClient)
    const mockedGraphClient = mock(TheGraphClient)
    when(mockedGraphClient.findWearableUrnsByOwner(SOME_ADDRESS)).thenResolve([WEARABLE_ID_1])

    const tpFetcher = { fetchAssets: jest.fn() }
    const tpUrnFinderSpy = jest.spyOn(tpUrnFinder, 'findThirdPartyItemUrns').mockResolvedValue([])

    const wearables = await getWearablesByOwner(
      false,
      instance(contentClientMock),
      instance(mockedGraphClient),
      tpFetcher,
      undefined,
      SOME_ADDRESS
    )

    expect(wearables.length).toEqual(1)
    expect(wearables[0].amount).toEqual(1)
    expect(wearables[0].urn).toEqual(WEARABLE_ID_1)
    expect(wearables[0].definition).toBeUndefined()
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).never()
    verify(mockedGraphClient.findWearableUrnsByOwner(SOME_ADDRESS)).once()
    expect(tpUrnFinderSpy).not.toBeCalled()
  })

  it('should call the graph client with the arguments correctly mapped', async () => {
    const contentClientMock = mock(SmartContentClient)

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
    const subGraphs = {
      ensSubgraph: jest.fn() as any as ISubgraphComponent,
      collectionsSubgraph: { query: jest.fn() },
      maticCollectionsSubgraph: { query: jest.fn() },
      thirdPartyRegistrySubgraph: jest.fn() as any as ISubgraphComponent
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
    const graphClient = new TheGraphClient(subGraphs)

    const tpFetcher = { fetchAssets: jest.fn() }
    const tpUrnFinderSpy = jest.spyOn(tpUrnFinder, 'findThirdPartyItemUrns').mockResolvedValue([])

    const wearables = await getWearablesByOwner(
      false,
      instance(contentClientMock),
      graphClient,
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
    expect(tpUrnFinderSpy).not.toBeCalled()
  })
})
