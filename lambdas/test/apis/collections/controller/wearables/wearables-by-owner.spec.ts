import { EntityType, EntityVersion } from 'dcl-catalyst-commons'
import { anything, instance, mock, verify, when } from 'ts-mockito'
import { FindWearablesByOwner, getWearablesByOwner } from '../../../../../src/apis/collections/controllers/wearables'
import { ThirdPartyAsset, WearableId } from '../../../../../src/apis/collections/types'
import { SmartContentClient } from '../../../../../src/utils/SmartContentClient'
import { TheGraphClient } from '../../../../../src/utils/TheGraphClient'
import { createThirdPartyResolver, ThirdPartyFetcher } from '../../../../../src/utils/third-party'

const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
const WEARABLE_ID_1 = 'someCollection-someWearable'
const WEARABLE_ID_2 = 'someOtherCollection-someOtherWearable'
const TPW_WEARABLE_ID = 'urn:decentraland:mumbai:collections-thirdparty:some-third-party:someWearable'
const WEARABLE_METADATA = {
  id: 'someId',
  someProperty: 'someValue',
  data: { representations: [] },
  image: undefined,
  thumbnail: undefined
} as any

describe('wearables by owner', () => {
  it(`When user doesn't have any wearables, then the response is empty`, async () => {
    const { instance: contentClient, mock: contentClientMock } = emptyContentServer()
    const graphClient = noOwnedWearables()

    const wearables = await getWearablesByOwner(SOME_ADDRESS, false, contentClient, graphClient)

    expect(wearables.length).toEqual(0)
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).never()
  })

  it(`When user has repeated wearables, then they are grouped together`, async () => {
    const { instance: contentClient, mock: contentClientMock } = emptyContentServer()
    const graphClient = ownedWearables(WEARABLE_ID_1, WEARABLE_ID_1, WEARABLE_ID_2)

    const wearables = await getWearablesByOwner(SOME_ADDRESS, false, contentClient, graphClient)

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

  it(`When user requests definitions, then they are included in the response`, async () => {
    const { instance: contentClient, mock: contentClientMock } = contentServerThatReturns(WEARABLE_ID_1)
    const graphClient = ownedWearables(WEARABLE_ID_1)

    const wearables = await getWearablesByOwner(SOME_ADDRESS, true, contentClient, graphClient)

    expect(wearables.length).toEqual(1)
    const [wearable] = wearables
    expect(wearable.urn).toBe(WEARABLE_ID_1)
    expect(wearable.amount).toBe(1)
    expect(wearable.definition).toEqual({ ...WEARABLE_METADATA, id: WEARABLE_ID_1 })
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).once()
  })

  it(`When wearable can't be found, then the definition is not returned`, async () => {
    const { instance: contentClient, mock: contentClientMock } = emptyContentServer()
    const graphClient = ownedWearables(WEARABLE_ID_1)

    const wearables = await getWearablesByOwner(SOME_ADDRESS, true, contentClient, graphClient)

    expect(wearables.length).toEqual(1)
    const [wearable] = wearables
    expect(wearable.urn).toBe(WEARABLE_ID_1)
    expect(wearable.amount).toBe(1)
    expect(wearable.definition).toBeUndefined()
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).once()
  })

  it(`When third party wearable collectionId is present, it should return the corresponding one`, async () => {
    const { instance: thirdPartyFetcherInstance, mock: thirdPartyFetcherMock } = thirdPartyFetcher([
      {
        id: TPW_WEARABLE_ID,
        amount: 1,
        urn: { decentraland: TPW_WEARABLE_ID }
      }
    ])
    const { instance: thirdPartyGraphClientInstance, mock: thirdPartyGraphClientMock } = thirdPartyGraphClient()

    const resolver = await thirdPartyResolver(
      thirdPartyGraphClientInstance,
      thirdPartyFetcherInstance,
      'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
    )
    const { instance: contentClient, mock: contentClientMock } = contentServerThatReturns(TPW_WEARABLE_ID)

    const wearables = await getWearablesByOwner(SOME_ADDRESS, true, contentClient, resolver)

    expect(wearables.length).toEqual(1)
    const [wearable] = wearables
    expect(wearable.urn).toBe(TPW_WEARABLE_ID)
    expect(wearable.amount).toBe(1)
    expect(wearable.definition).toEqual({ ...WEARABLE_METADATA, id: TPW_WEARABLE_ID })
    verify(contentClientMock.fetchEntitiesByPointers(anything(), anything())).once()
    verify(thirdPartyFetcherMock.fetchAssets(anything(), anything(), anything())).once()
    verify(thirdPartyGraphClientMock.findThirdPartyResolver(anything(), anything())).once()
  })

  it(`When there is no third party registered for a collectionId, it should return an error`, async () => {
    const collectionId = 'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
    const { instance } = noThirdPartyRegistered()
    const { instance: thirdPartyFetcherInstance } = thirdPartyFetcher([])
    await expect(thirdPartyResolver(instance, thirdPartyFetcherInstance, collectionId)).rejects.toThrowError(
      `Could not find third party resolver for collectionId: ${collectionId}`
    )
  })

  it(`When there a third party resolver doesn't respond, it should return an error`, async () => {
    const { instance: thirdPartyFetcher } = undefinedThirdPartyFetcher()
    const { instance: thirdPartyGraphClientInstance } = thirdPartyGraphClient()

    const resolver = await thirdPartyResolver(
      thirdPartyGraphClientInstance,
      thirdPartyFetcher,
      'urn:decentraland:mumbai:collections-thirdparty:some-third-party'
    )

    const { instance: contentClient } = contentServerThatReturns(WEARABLE_ID_1)

    await expect(getWearablesByOwner(SOME_ADDRESS, true, contentClient, resolver)).rejects.toThrowError(
      `Could not fetch assets for owner: ${SOME_ADDRESS}`
    )
  })
})

function emptyContentServer() {
  return contentServerThatReturns()
}

function contentServerThatReturns(id?: WearableId) {
  const entity = {
    version: EntityVersion.V3,
    id: '',
    type: EntityType.WEARABLE,
    pointers: [id ?? ''],
    timestamp: 10,
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

async function thirdPartyResolver(
  graphClient: TheGraphClient,
  thirdPartyFetcher: ThirdPartyFetcher,
  collectionId: string
): Promise<FindWearablesByOwner> {
  return await createThirdPartyResolver(graphClient, thirdPartyFetcher, collectionId)
}

function thirdPartyFetcher(assets: ThirdPartyAsset[]): { instance: ThirdPartyFetcher; mock: ThirdPartyFetcher } {
  const resolver = mock<ThirdPartyFetcher>()
  when(resolver.fetchAssets(anything(), anything(), anything())).thenResolve(assets)
  return { instance: instance(resolver), mock: resolver }
}

function undefinedThirdPartyFetcher(): { instance: ThirdPartyFetcher; mock: ThirdPartyFetcher } {
  const resolver = mock<ThirdPartyFetcher>()
  when(resolver.fetchAssets(anything(), anything(), anything())).thenResolve(undefined)
  return { instance: instance(resolver), mock: resolver }
}

function noThirdPartyRegistered() {
  const mockedClient = mock(TheGraphClient)
  when(mockedClient.findThirdPartyResolver(anything(), anything())).thenResolve(undefined)
  return { instance: instance(mockedClient), mock: mockedClient }
}

function thirdPartyGraphClient(url: string = 'someUrl'): { instance: TheGraphClient; mock: TheGraphClient } {
  const mockedClient = mock(TheGraphClient)
  when(mockedClient.findThirdPartyResolver(anything(), anything())).thenResolve(url)
  return { instance: instance(mockedClient), mock: mockedClient }
}

function noOwnedWearables() {
  return ownedWearables()
}

function ownedWearables(...ownedWearables: WearableId[]): TheGraphClient {
  const mockedClient = mock(TheGraphClient)
  when(mockedClient.findWearablesByOwner(anything())).thenResolve(ownedWearables)
  return instance(mockedClient)
}
