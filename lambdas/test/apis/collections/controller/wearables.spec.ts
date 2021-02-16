import { getWearables, getWearablesByOwner } from '@katalyst/lambdas/apis/collections/controllers/wearables'
import { OffChainWearablesManager } from '@katalyst/lambdas/apis/collections/off-chain/OffChainWearablesManager'
import { WearableId } from '@katalyst/lambdas/apis/collections/types'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { EntityType } from 'dcl-catalyst-commons'
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito'

const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
const WEARABLE_ID_1 = 'someCollection-someWearable'
const WEARABLE_ID_2 = 'someOtherCollection-someOtherWearable'
const WEARABLE_METADATA = {
  someProperty: 'someValue',
  data: { representations: [] },
  image: undefined,
  thumbnail: undefined
} as any
const WEARABLE = {
  someProperty: 'someValue'
} as any

describe('wearables', () => {
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
    const { instance: contentClient, mock: contentClientMock } = contentServerThatReturns(WEARABLE_METADATA)
    const graphClient = ownedWearables(WEARABLE_ID_1)

    const wearables = await getWearablesByOwner(SOME_ADDRESS, true, contentClient, graphClient)

    expect(wearables.length).toEqual(1)
    const [wearable] = wearables
    expect(wearable.urn).toBe(WEARABLE_ID_1)
    expect(wearable.amount).toBe(1)
    expect(wearable.definition).toEqual(WEARABLE_METADATA)
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

  it(`When page is filled by off-chain, then subgraph is never queried`, async () => {
    const { instance: contentClient } = emptyContentServer()
    const { instance: graphClient, mock: graphClientMock } = noExistingWearables()
    const offChain = offChainManager()

    const pagination = { offset: 0, limit: 1 }
    const wearables = await getWearables({}, pagination, contentClient, graphClient, offChain)

    expect(wearables).toEqual([WEARABLE])
    verify(graphClientMock.findWearablesByFilters(anything(), anything())).never()
  })

  it(`When page is not filled by off-chain, then subgraph is queried with the correct parameters`, async () => {
    const { instance: contentClient } = contentServerThatReturns(WEARABLE_METADATA)
    const { instance: graphClient, mock: graphClientMock } = existingWearables(WEARABLE_ID_1)
    const offChain = offChainManager()

    const filters = {}
    const pagination = { offset: 0, limit: 2 }
    const wearables = await getWearables(filters, pagination, contentClient, graphClient, offChain)

    expect(wearables.length).toEqual(2)
    verify(graphClientMock.findWearablesByFilters(deepEqual(filters), deepEqual({ offset: 0, limit: 1 }))).once()
  })
})

function emptyContentServer() {
  return contentServerThatReturns()
}

function offChainManager(): OffChainWearablesManager {
  const mockedManager = mock(OffChainWearablesManager)
  when(mockedManager.find(anything())).thenResolve([WEARABLE])
  return instance(mockedManager)
}

function contentServerThatReturns(metadata?: any) {
  const entity = {
    id: '',
    type: EntityType.WEARABLE,
    pointers: [WEARABLE_ID_1],
    timestamp: 10,
    metadata
  }
  const mockedClient = mock(SmartContentClient)
  when(mockedClient.fetchEntitiesByPointers(anything(), anything())).thenResolve(metadata ? [entity] : [])
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

function noExistingWearables() {
  return existingWearables()
}

function existingWearables(...existingWearables: WearableId[]) {
  const mockedClient = mock(TheGraphClient)
  when(mockedClient.findWearablesByFilters(anything(), anything())).thenResolve(existingWearables)
  return { instance: instance(mockedClient), mock: mockedClient }
}
