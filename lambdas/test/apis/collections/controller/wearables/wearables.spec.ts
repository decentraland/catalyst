import { Entity, EntityType, WearableId } from '@dcl/schemas'
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
  describe('when only off-chain ids are requested', () => {
    let contentClient: jest.Mocked<SmartContentClient>
    let mockedGraphClient: { findWearableUrnsByFilters: jest.Mock }
    let offChain: jest.Mocked<OffChainWearablesManager>

    beforeEach(() => {
      contentClient = emptyContentServer()
      mockedGraphClient = noExistingWearables()
      offChain = offChainManagerWith(OFF_CHAIN_WEARABLE)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should not query content server and subgraph', async () => {
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
      expect(contentClient.fetchEntitiesByPointers).not.toHaveBeenCalled()
    })
  })

  describe('when on-chain ids are requested', () => {
    let contentClient: jest.Mocked<SmartContentClient>
    let mockedGraphClient: { findWearableUrnsByFilters: jest.Mock }
    let offChain: jest.Mocked<OffChainWearablesManager>

    beforeEach(() => {
      contentClient = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
      mockedGraphClient = noExistingWearables()
      offChain = offChainManagerWith(OFF_CHAIN_WEARABLE)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query content servers but not subgraph', async () => {
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
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([ON_CHAIN_WEARABLE_ID])
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledTimes(1)
    })
  })

  describe('when lastId is not a base avatar', () => {
    let contentClient: jest.Mocked<SmartContentClient>
    let mockedGraphClient: { findWearableUrnsByFilters: jest.Mock }
    let offChain: jest.Mocked<OffChainWearablesManager>

    beforeEach(() => {
      contentClient = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
      mockedGraphClient = noExistingWearables()
      offChain = emptyOffChainManager()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should not call the offChainManager', async () => {
      const pagination = { limit: 3, lastId: ON_CHAIN_WEARABLE_ID }
      const filters = { textSearch: 'Something' }
      const response = await getWearables(filters, pagination, contentClient, mockedGraphClient as any, offChain)

      expect(response.wearables.length).toEqual(0)
      expect(mockedGraphClient.findWearableUrnsByFilters).toHaveBeenCalledWith(filters, expect.objectContaining(pagination))
      expect(offChain.find).not.toHaveBeenCalled()
    })
  })

  describe('when lastId is a base avatar', () => {
    let contentClient: jest.Mocked<SmartContentClient>
    let mockedGraphClient: { findWearableUrnsByFilters: jest.Mock }
    let offChain: jest.Mocked<OffChainWearablesManager>

    beforeEach(() => {
      contentClient = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
      mockedGraphClient = noExistingWearables()
      offChain = emptyOffChainManager()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should call the offChainManager', async () => {
      const pagination = { limit: 3, lastId: OFF_CHAIN_WEARABLE_ID }
      const filters = { textSearch: 'Something' }
      const response = await getWearables(filters, pagination, contentClient, mockedGraphClient as any, offChain)

      expect(response.wearables.length).toEqual(0)
      expect(mockedGraphClient.findWearableUrnsByFilters).toHaveBeenCalledWith(
        filters,
        expect.objectContaining({ ...pagination, lastId: undefined })
      )
      expect(offChain.find).toHaveBeenCalledWith(filters, OFF_CHAIN_WEARABLE_ID)
      expect(offChain.find).toHaveBeenCalledTimes(1)
    })
  })

  describe('when collection id is base avatars', () => {
    let contentClient: jest.Mocked<SmartContentClient>
    let mockedGraphClient: { findWearableUrnsByFilters: jest.Mock }
    let offChain: jest.Mocked<OffChainWearablesManager>

    beforeEach(() => {
      contentClient = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
      mockedGraphClient = noExistingWearables()
      offChain = emptyOffChainManager()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should never query subgraph', async () => {
      const pagination = { limit: 3, lastId: undefined }
      const filters = { collectionIds: [BASE_AVATARS_COLLECTION_ID] }
      const response = await getWearables(filters, pagination, contentClient, mockedGraphClient as any, offChain)

      expect(response.wearables.length).toEqual(0)
      expect(mockedGraphClient.findWearableUrnsByFilters).not.toHaveBeenCalled()
      expect(offChain.find).toHaveBeenCalledWith(filters, undefined)
      expect(offChain.find).toHaveBeenCalledTimes(1)
    })
  })

  describe('when there is more data than the one returned', () => {
    let contentClient: jest.Mocked<SmartContentClient>
    let mockedGraphClient: { findWearableUrnsByFilters: jest.Mock }
    let offChain: jest.Mocked<OffChainWearablesManager>

    beforeEach(() => {
      contentClient = contentServerThatReturns(ON_CHAIN_WEARABLE_ID)
      mockedGraphClient = existingWearables(ON_CHAIN_WEARABLE_ID)
      offChain = offChainManagerWith(OFF_CHAIN_WEARABLE)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should include last id', async () => {
      const pagination = { limit: 1, lastId: undefined }
      const filters = { textSearch: 'Something' }
      const response = await getWearables(filters, pagination, contentClient, mockedGraphClient as any, offChain)

      expect(response.wearables.length).toEqual(1)
      expect(response.lastId).toEqual(OFF_CHAIN_WEARABLE_ID)
      expect(mockedGraphClient.findWearableUrnsByFilters).toHaveBeenCalledWith(
        filters,
        expect.objectContaining({ limit: 0, lastId: undefined })
      )
      expect(offChain.find).toHaveBeenCalledWith(filters, undefined)
      expect(offChain.find).toHaveBeenCalledTimes(1)
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([ON_CHAIN_WEARABLE_ID])
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledTimes(1)
    })
  })
})

function emptyContentServer(): jest.Mocked<SmartContentClient> {
  return contentServerThatReturns()
}

function expectWearablesToBe(response: { wearables: LambdasWearable[] }, ...expectedIds: WearableId[]) {
  const ids = response.wearables.map(({ id }) => id)
  expect(ids).toEqual(expectedIds)
}

function emptyOffChainManager(): jest.Mocked<OffChainWearablesManager> {
  return offChainManagerWith()
}

function offChainManagerWith(...wearables: LambdasWearable[]): jest.Mocked<OffChainWearablesManager> {
  return {
    find: jest.fn().mockResolvedValue(wearables)
  } as unknown as jest.Mocked<OffChainWearablesManager>
}

function contentServerThatReturns(id?: WearableId): jest.Mocked<SmartContentClient> {
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
  return {
    fetchEntitiesByPointers: jest.fn().mockResolvedValue(id ? [entity] : [])
  } as unknown as jest.Mocked<SmartContentClient>
}

function noExistingWearables() {
  return existingWearables()
}

function existingWearables(...existingWearables: WearableId[]) {
  return {
    findWearableUrnsByFilters: jest.fn().mockResolvedValue(existingWearables)
  }
}
