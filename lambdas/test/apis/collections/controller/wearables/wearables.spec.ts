import { getWearables } from '@katalyst/lambdas/apis/collections/controllers/wearables'
import { OffChainWearablesManager } from '@katalyst/lambdas/apis/collections/off-chain/OffChainWearablesManager'
import { WearableId } from '@katalyst/lambdas/apis/collections/types'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { EntityType } from 'dcl-catalyst-commons'
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito'

const WEARABLE_ID_1 = 'someCollection-someWearable'
const WEARABLE_ID_2 = 'someOtherCollection-someOtherWearable'
const WEARABLE_METADATA = {
  someProperty: 'someValue',
  data: { representations: [] },
  image: undefined,
  thumbnail: undefined
} as any
const WEARABLE_1 = {
  someProperty: 'someValue'
} as any
const WEARABLE_2 = {
  anotherProperty: 'anotherValue'
} as any

describe('wearables', () => {
  it(`When page is the exact amount of off-chain, then subgraph is queried for moreData`, async () => {
    const { instance: contentClient } = emptyContentServer()
    const { instance: graphClient, mock: graphClientMock } = noExistingWearables()
    const offChain = offChainManager()

    const pagination = { offset: 0, limit: 3 }
    const response = await getWearables({}, pagination, contentClient, graphClient, offChain)

    expect(response.wearables).toEqual([WEARABLE_1])
    expect(response.pagination.offset).toEqual(0)
    expect(response.pagination.limit).toEqual(3)
    expect(response.filters).toEqual({})
    expect(response.pagination.moreData).toBeFalsy()
    verify(graphClientMock.findWearablesByFilters(anything(), anything())).once()
  })

  it(`When page is the exact amount of off-chain, then subgraph is queried for moreData`, async () => {
    const { instance: contentClient } = emptyContentServer()
    const { instance: graphClient, mock: graphClientMock } = noExistingWearables()
    const offChain = offChainManager()

    const pagination = { offset: 0, limit: 1 }
    const response = await getWearables({}, pagination, contentClient, graphClient, offChain)

    expect(response.wearables).toEqual([WEARABLE_1])
    expect(response.pagination.offset).toEqual(0)
    expect(response.pagination.limit).toEqual(1)
    expect(response.filters).toEqual({})
    expect(response.pagination.moreData).toBeFalsy()
    verify(graphClientMock.findWearablesByFilters(anything(), anything())).once()
  })

  it(`When page is filled by off-chain with extra, then subgraph is never queried`, async () => {
    const { instance: contentClient } = emptyContentServer()
    const { instance: graphClient, mock: graphClientMock } = noExistingWearables()
    const offChain = offChainManagerWith([WEARABLE_1, WEARABLE_2])

    const pagination = { offset: 0, limit: 1 }
    const response = await getWearables({}, pagination, contentClient, graphClient, offChain)

    expect(response.wearables).toEqual([WEARABLE_1])
    expect(response.pagination.offset).toEqual(0)
    expect(response.pagination.limit).toEqual(1)
    expect(response.filters).toEqual({})
    expect(response.pagination.moreData).toBeTruthy()
    verify(graphClientMock.findWearablesByFilters(anything(), anything())).never()
  })

  it(`When page is not filled by off-chain, then subgraph is queried with the correct parameters with extra`, async () => {
    const { instance: contentClient } = contentServerThatReturns(WEARABLE_METADATA)
    const { instance: graphClient, mock: graphClientMock } = existingWearables(WEARABLE_ID_1)
    const offChain = offChainManagerWith([WEARABLE_1, WEARABLE_2])

    const filters = {}
    const pagination = { offset: 0, limit: 2 }
    const response = await getWearables(filters, pagination, contentClient, graphClient, offChain)

    expect(response.wearables.length).toEqual(2)
    expect(response.pagination.offset).toEqual(0)
    expect(response.pagination.limit).toEqual(2)
    expect(response.filters).toEqual(filters)
    expect(response.pagination.moreData).toBeTruthy()
    verify(graphClientMock.findWearablesByFilters(deepEqual(filters), deepEqual({ offset: 0, limit: 1 }))).once()
  })
})

function emptyContentServer() {
  return contentServerThatReturns()
}

function offChainManager(): OffChainWearablesManager {
  return offChainManagerWith([WEARABLE_1])
}

function offChainManagerWith(wearables: any[]): OffChainWearablesManager {
  const mockedManager = mock(OffChainWearablesManager)
  when(mockedManager.find(anything())).thenResolve(wearables)
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
