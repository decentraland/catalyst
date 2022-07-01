import { Entity, EntityType } from '@dcl/schemas'
import { anything, instance, mock, verify, when } from 'ts-mockito'
import { getWearablesByOwner } from '../../../../../src/apis/collections/controllers/wearables'
import { WearableId } from '../../../../../src/apis/collections/types'
import { SmartContentClient } from '../../../../../src/utils/SmartContentClient'

// const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
const WEARABLE_ID_1 = 'someCollection-someWearable'
const WEARABLE_ID_2 = 'someOtherCollection-someOtherWearable'
// const TPW_WEARABLE_ID = 'urn:decentraland:mumbai:collections-thirdparty:some-third-party:someWearable'
const WEARABLE_METADATA = {
  id: 'someId',
  someProperty: 'someValue',
  data: { representations: [] },
  image: undefined,
  thumbnail: undefined
} as any

describe('getWearablesByOwner', () => {
  it(`When user doesn't have any wearables, then the response is empty`, async () => {
    const { instance: contentClient, mock: contentClientMock } = emptyContentServer()

    const wearables = await getWearablesByOwner(false, contentClient, [])

    expect(wearables.length).toEqual(0)
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).never()
  })

  it('When user has repeated wearables, then they are grouped together', async () => {
    const { instance: contentClient, mock: contentClientMock } = emptyContentServer()

    const wearables = await getWearablesByOwner(false, contentClient, [WEARABLE_ID_1, WEARABLE_ID_1, WEARABLE_ID_2])

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
    const { instance: contentClient, mock: contentClientMock } = contentServerThatReturns(WEARABLE_ID_1)

    const wearables = await getWearablesByOwner(true, contentClient, [WEARABLE_ID_1])

    expect(wearables.length).toEqual(1)
    const [wearable] = wearables
    expect(wearable.urn).toBe(WEARABLE_ID_1)
    expect(wearable.amount).toBe(1)
    expect(wearable.definition).toEqual({ ...WEARABLE_METADATA, id: WEARABLE_ID_1 })
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).once()
  })

  it(`When wearable can't be found, then the definition is not returned`, async () => {
    const { instance: contentClient, mock: contentClientMock } = emptyContentServer()

    const wearables = await getWearablesByOwner(true, contentClient, [WEARABLE_ID_1])

    expect(wearables.length).toEqual(1)
    const [wearable] = wearables
    expect(wearable.urn).toBe(WEARABLE_ID_1)
    expect(wearable.amount).toBe(1)
    expect(wearable.definition).toBeUndefined()
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).once()
  })

  // it(`When third party wearable collectionId is present, it should return the corresponding one`, async () => {
  //   const { instance: thirdPartyFetcherInstance, mock: thirdPartyFetcherMock } = thirdPartyFetcher([
  //     {
  //       id: TPW_WEARABLE_ID,
  //       amount: 1,
  //       urn: { decentraland: TPW_WEARABLE_ID }
  //     }
  //   ])
  //   const { instance: thirdPartyGraphClientInstance, mock: thirdPartyGraphClientMock } = thirdPartyGraphClient()

  //   const resolver = await thirdPartyResolver(
  //     thirdPartyGraphClientInstance,
  //     thirdPartyFetcherInstance,
  //     'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
  //   )
  //   const { instance: contentClient, mock: contentClientMock } = contentServerThatReturns(TPW_WEARABLE_ID)

  //   const wearables = await getWearablesByOwner(true, contentClient, await resolver.findWearableUrnsByOwner(SOME_ADDRESS))

  //   expect(wearables.length).toEqual(1)
  //   const [wearable] = wearables
  //   expect(wearable.urn).toBe(TPW_WEARABLE_ID)
  //   expect(wearable.amount).toBe(1)
  //   expect(wearable.definition).toEqual({ ...WEARABLE_METADATA, id: TPW_WEARABLE_ID })
  //   verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).once()
  //   verify(thirdPartyFetcherMock.fetchAssets(anything(), anything(), anything())).once()
  //   verify(thirdPartyGraphClientMock.findThirdPartyResolver(anything(), anything())).once()
  // })

  // it(`When there is no third party registered for a collectionId, it should return an error`, async () => {
  //   const collectionId = 'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
  //   const { instance } = noThirdPartyRegistered()
  //   const { instance: thirdPartyFetcherInstance } = thirdPartyFetcher([])
  //   await expect((await thirdPartyResolver(instance, thirdPartyFetcherInstance, collectionId)).findWearableUrnsByOwner).rejects.toThrowError(
  //     `Could not find third party resolver for collectionId: ${collectionId}`
  //   )
  // })

  // it(`When there a third party resolver doesn't respond, it should return an error`, async () => {
  //   const { instance: thirdPartyFetcher } = undefinedThirdPartyFetcher()
  //   const { instance: thirdPartyGraphClientInstance } = thirdPartyGraphClient()

  //   const resolver = await thirdPartyResolver(
  //     thirdPartyGraphClientInstance,
  //     thirdPartyFetcher,
  //     'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
  //   )

  //   await expect(resolver.findWearableUrnsByOwner(SOME_ADDRESS)).rejects.toThrowError(
  //     `Could not fetch assets for owner: ${SOME_ADDRESS}`
  //   )
  // })
})

function emptyContentServer() {
  return contentServerThatReturns()
}

function contentServerThatReturns(id?: WearableId) {
  const entity: Entity = {
    version: 'v3',
    id: '',
    type: EntityType.WEARABLE,
    pointers: [id ?? ''],
    timestamp: 10,
    content: [],
    metadata: {
      id,
      someProperty: 'someValue',
      data: { representations: [] },
      image: undefined,
      thumbnail: undefined
    }
  }
  const mockedClient = mock(SmartContentClient)
  when(mockedClient.fetchEntitiesByPointers(anything(), anything())).thenResolve(id ? [entity] : [])
  return { instance: instance(mockedClient), mock: mockedClient }
}

// async function thirdPartyResolver(
//   graphClient: TheGraphClient,
//   thirdPartyFetcher: ThirdPartyFetcherOld,
//   collectionId: string
// ) {
//   // return (owner) => thirdParty.findWearableUrnsByOwner(owner, graphClient, thirdPartyFetcher, collectionId)
//   return {
//     findWearableUrnsByOwner: async (owner) => thirdParty(owner, graphClient, thirdPartyFetcher, collectionId)
//   }

//   // return await createThirdPartyResolverAux(graphClient, thirdPartyFetcher, collectionId)
// }

// function thirdPartyFetcher(assets: ThirdPartyAsset[]): { instance: ThirdPartyFetcherOld; mock: ThirdPartyFetcherOld } {
//   const resolver = mock<ThirdPartyFetcherOld>()
//   when(resolver.fetchAssets(anything(), anything(), anything())).thenResolve(assets)
//   return { instance: instance(resolver), mock: resolver }
// }

// function undefinedThirdPartyFetcher(): { instance: ThirdPartyFetcherOld; mock: ThirdPartyFetcherOld } {
//   const resolver = mock<ThirdPartyFetcherOld>()
//   when(resolver.fetchAssets(anything(), anything(), anything())).thenResolve(undefined)
//   return { instance: instance(resolver), mock: resolver }
// }

// function noThirdPartyRegistered() {
//   const mockedClient = mock(TheGraphClient)
//   when(mockedClient.findThirdPartyResolver(anything(), anything())).thenResolve(undefined)
//   return { instance: instance(mockedClient), mock: mockedClient }
// }

// function thirdPartyGraphClient(url: string = 'someUrl'): { instance: TheGraphClient; mock: TheGraphClient } {
//   const mockedClient = mock(TheGraphClient)
//   when(mockedClient.findThirdPartyResolver(anything(), anything())).thenResolve(url)
//   return { instance: instance(mockedClient), mock: mockedClient }
// }

// function noOwnedWearables() {
//   return ownedWearables()
// }

// function ownedWearables(...ownedWearables: WearableId[]): TheGraphClient {
//   const mockedClient = mock(TheGraphClient)
//   when(mockedClient.findWearableUrnsByOwner(anything())).thenResolve(ownedWearables)
//   return instance(mockedClient)
// }
