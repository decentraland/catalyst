import { getWearablesByOwner } from '@katalyst/lambdas/apis/collections/controllers/wearables'
import { WearableId } from '@katalyst/lambdas/apis/collections/types'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { EntityType } from 'dcl-catalyst-commons'
import { anything, instance, mock, verify, when } from 'ts-mockito'

const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
const WEARABLE_ID_1 = 'someCollection-someWearable'
const WEARABLE_ID_2 = 'someOtherCollection-someOtherWearable'
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
})

function emptyContentServer() {
  return contentServerThatReturns()
}

function contentServerThatReturns(id?: WearableId) {
  const entity = {
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

function noOwnedWearables() {
  return ownedWearables()
}

function ownedWearables(...ownedWearables: WearableId[]): TheGraphClient {
  const mockedClient = mock(TheGraphClient)
  when(mockedClient.findWearablesByOwner(anything())).thenResolve(ownedWearables)
  return instance(mockedClient)
}
