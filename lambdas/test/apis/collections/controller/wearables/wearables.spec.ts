import { Entity, EntityType, WearableId } from '@dcl/schemas'
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito'
import { getWearables } from '../../../../../src/apis/collections/controllers/wearables'
import {
  BASE_AVATARS_COLLECTION_ID,
  OffChainWearablesManager
} from '../../../../../src/apis/collections/off-chain/OffChainWearablesManager'
import { LambdasWearable } from '../../../../../src/apis/collections/types'
import { SmartContentClient } from '../../../../../src/utils/SmartContentClient'

const OFF_CHAIN_WEARABLE_ID = 'urn:decentraland:off-chain:base-avatars:wearable'
const ON_CHAIN_WEARABLE_ID = 'someOtherCollection-someOtherWearable'
const OFF_CHAIN_WEARABLE = {
  id: OFF_CHAIN_WEARABLE_ID,
  someProperty: 'someValue'
} as any

describe('wearables', () => {
  it(`When only off-chain ids are requested, then content server and subgraph are not queried`, async () => {
    const { instance: contentClient, mock: contentServerMock } = emptyContentServer()
    const mockedGraphClient = noExistingWearables()
    const { instance: offChain } = offChainManagerWith(OFF_CHAIN_WEARABLE)

    const pagination = { limit: 3, lastId: undefined }
    const response = await getWearables(
      { itemIds: [OFF_CHAIN_WEARABLE_ID] },
      pagination,
      contentClient,
      mockedGraphClient as any,
      offChain
    )

    expect(response.wearables).toEqual([OFF_CHAIN_WEARABLE])
    expect(response.lastId).toBeUndefined()
    expect(mockedGraphClient.findWearableUrnsByFilters).not.toHaveBeenCalled()
    verify(contentServerMock.fetchEntitiesByPointers(anything(), anything())).never()
  })
})

it(`When on-chain ids are requested, then content servers is queried, but subgraph isn't`, async () => {
  const { instance: contentClient, mock: contentServerMock } = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
  const mockedGraphClient = noExistingWearables()
  const { instance: offChain } = offChainManagerWith(OFF_CHAIN_WEARABLE)

  const pagination = { limit: 3, lastId: undefined }
  const response = await getWearables(
    { itemIds: [OFF_CHAIN_WEARABLE_ID, ON_CHAIN_WEARABLE_ID] },
    pagination,
    contentClient,
    mockedGraphClient as any,
    offChain
  )

  expectWearablesToBe(response, OFF_CHAIN_WEARABLE_ID, ON_CHAIN_WEARABLE_ID)
  expect(response.lastId).toBeUndefined()
  expect(mockedGraphClient.findWearableUrnsByFilters).not.toHaveBeenCalled()
  verify(contentServerMock.fetchEntitiesByPointers(deepEqual([ON_CHAIN_WEARABLE_ID]))).once()
})

it(`When lastId isn't base avatar, then the offChainManager isn't called`, async () => {
  const { instance: contentClient } = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
  const mockedGraphClient = noExistingWearables()
  const { instance: offChain, mock: offChainMock } = emptyOffChainManager()

  const pagination = { limit: 3, lastId: ON_CHAIN_WEARABLE_ID }
  const filters = { textSearch: 'Something' }
  const response = await getWearables(filters, pagination, contentClient, mockedGraphClient as any, offChain)

  expect(response.wearables.length).toEqual(0)
  expect(mockedGraphClient.findWearableUrnsByFilters).toHaveBeenCalledWith(filters, expect.objectContaining(pagination))
  verify(offChainMock.find(anything(), anything())).never()
})

it(`When lastId is a base avatar, then the offChainManager is called`, async () => {
  const { instance: contentClient } = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
  const mockedGraphClient = noExistingWearables()
  const { instance: offChain, mock: offChainMock } = emptyOffChainManager()

  const pagination = { limit: 3, lastId: OFF_CHAIN_WEARABLE_ID }
  const filters = { textSearch: 'Something' }
  const response = await getWearables(filters, pagination, contentClient, mockedGraphClient as any, offChain)

  expect(response.wearables.length).toEqual(0)
  expect(mockedGraphClient.findWearableUrnsByFilters).toHaveBeenCalledWith(
    filters,
    expect.objectContaining({ ...pagination, lastId: undefined })
  )
  verify(offChainMock.find(filters, OFF_CHAIN_WEARABLE_ID)).once()
})

it(`When collection id is base avatars, then subgraph is never queried`, async () => {
  const { instance: contentClient } = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
  const mockedGraphClient = noExistingWearables()
  const { instance: offChain, mock: offChainMock } = emptyOffChainManager()

  const pagination = { limit: 3, lastId: undefined }
  const filters = { collectionIds: [BASE_AVATARS_COLLECTION_ID] }
  const response = await getWearables(filters, pagination, contentClient, mockedGraphClient as any, offChain)

  expect(response.wearables.length).toEqual(0)
  expect(mockedGraphClient.findWearableUrnsByFilters).not.toHaveBeenCalled()
  verify(offChainMock.find(filters, undefined)).once()
})

it(`When there is more data than the one returned, then last id is included`, async () => {
  const { instance: contentClient, mock: contentServerMock } = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
  const mockedGraphClient = existingWearables(ON_CHAIN_WEARABLE_ID)
  const { instance: offChain, mock: offChainMock } = offChainManagerWith(OFF_CHAIN_WEARABLE)

  const pagination = { limit: 1, lastId: undefined }
  const filters = { textSearch: 'Something' }
  const response = await getWearables(filters, pagination, contentClient, mockedGraphClient as any, offChain)

  expect(response.wearables.length).toEqual(1)
  expect(response.lastId).toEqual(OFF_CHAIN_WEARABLE_ID)
  expect(mockedGraphClient.findWearableUrnsByFilters).toHaveBeenCalledWith(
    filters,
    expect.objectContaining({ limit: 0, lastId: undefined })
  )
  verify(offChainMock.find(filters, undefined)).once()
  verify(contentServerMock.fetchEntitiesByPointers(deepEqual([ON_CHAIN_WEARABLE_ID]))).once()
})

function emptyContentServer() {
  return contentServerThatReturns()
}

function expectWearablesToBe(response: { wearables: LambdasWearable[] }, ...expectedIds: WearableId[]) {
  const ids = response.wearables.map(({ id }) => id)
  expect(ids).toEqual(expectedIds)
}

function emptyOffChainManager(): { instance: OffChainWearablesManager; mock: OffChainWearablesManager } {
  return offChainManagerWith()
}

function offChainManagerWith(...wearables: LambdasWearable[]): {
  instance: OffChainWearablesManager
  mock: OffChainWearablesManager
} {
  const mockedManager = mock(OffChainWearablesManager)
  when(mockedManager.find(anything())).thenResolve(wearables)
  when(mockedManager.find(anything(), anything())).thenResolve(wearables)
  return { instance: instance(mockedManager), mock: mockedManager }
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
  when(mockedClient.fetchEntitiesByPointers(anything())).thenResolve(id ? [entity] : [])
  return { instance: instance(mockedClient), mock: mockedClient }
}

function noExistingWearables() {
  return existingWearables()
}

function existingWearables(...existingWearables: WearableId[]) {
  const mockedGraphClient = {
    findWearableUrnsByFilters: jest.fn().mockResolvedValue(existingWearables)
  }
  return mockedGraphClient
}
