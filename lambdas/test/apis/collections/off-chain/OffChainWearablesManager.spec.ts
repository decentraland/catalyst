import { Entity, EntityType, WearableId } from '@dcl/schemas'
import { OffChainWearablesManager } from '../../../../src/apis/collections/off-chain/OffChainWearablesManager'
import { LambdasWearable } from '../../../../src/apis/collections/types'
import { SmartContentClient } from '../../../../src/utils/SmartContentClient'

const COLLECTION_ID_1 = 'some-collection'
const COLLECTION_ID_2 = 'some-other-collection'
const WEARABLE_ID_1 = `${COLLECTION_ID_1}-some-wearable`
const WEARABLE_ID_2 = `${COLLECTION_ID_1}-some-other-wearable`
const WEARABLE_ID_3 = `${COLLECTION_ID_2}-yet-another-wearable`
const COLLECTIONS = {
  [COLLECTION_ID_1]: [WEARABLE_ID_1, WEARABLE_ID_2],
  [COLLECTION_ID_2]: [WEARABLE_ID_3]
}

describe('OffChainWearablesManager', () => {
  beforeEach(() => jest.useFakeTimers())

  afterAll(() => jest.useRealTimers())

  describe('when definitions are loaded for the first time', () => {
    let contentClient: jest.Mocked<SmartContentClient>

    beforeEach(() => {
      contentClient = contentServer()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query the content server', async () => {
      const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS, refreshTime: '2s' })

      await manager.find({ collectionIds: [COLLECTION_ID_1] })

      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([WEARABLE_ID_1, WEARABLE_ID_2])
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([WEARABLE_ID_3])
    })
  })

  describe('when expire time ends', () => {
    let contentClient: jest.Mocked<SmartContentClient>

    beforeEach(() => {
      contentClient = contentServer()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should call the content server again', async () => {
      const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS, refreshTime: '2s' })

      await manager.find({ collectionIds: [COLLECTION_ID_1] })

      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([WEARABLE_ID_1, WEARABLE_ID_2])
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([WEARABLE_ID_3])

      contentClient.fetchEntitiesByPointers.mockClear()
      jest.runOnlyPendingTimers()
      // Although the find method isn't the one that triggers the update, it is needed for process to run the next tick
      await manager.find({ collectionIds: [COLLECTION_ID_1] })
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([WEARABLE_ID_1, WEARABLE_ID_2])
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([WEARABLE_ID_3])
    })
  })

  describe('when expire time ends and new objects need to be fetched', () => {
    let contentClientMock: jest.Mocked<SmartContentClient>
    let t1: number
    let t2: number

    beforeEach(() => {
      jest.useFakeTimers('legacy')
      t1 = 1
      t2 = 2
      contentClientMock = {
        fetchEntitiesByPointers: jest
          .fn()
          .mockResolvedValueOnce([buildEntityWithTimestampInMetadata(WEARABLE_ID_3, t1)])
          .mockResolvedValueOnce([buildEntityWithTimestampInMetadata(WEARABLE_ID_3, t2)])
      } as unknown as jest.Mocked<SmartContentClient>
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should fetch new objects from the content server', async () => {
      const manager = new OffChainWearablesManager({
        client: contentClientMock,
        collections: { [COLLECTION_ID_2]: [WEARABLE_ID_3] },
        refreshTime: '2s'
      })

      const firstWearables = await manager.find({ collectionIds: [COLLECTION_ID_2] })
      expect(firstWearables.length).toBe(1)
      expect(firstWearables[0].id).toBe(WEARABLE_ID_3)
      expect(firstWearables[0]['timestamp']).toBe(t1)

      contentClientMock.fetchEntitiesByPointers.mockClear()
      jest.advanceTimersByTime(2000)
      // Needed to finish the promise in the TimeRefreshedDataHolder that calls the content server
      await new Promise(process.nextTick)
      const secondWearables = await manager.find({ collectionIds: [COLLECTION_ID_2] })
      expect(secondWearables.length).toBe(1)
      expect(secondWearables[0].id).toBe(WEARABLE_ID_3)
      expect(secondWearables[0]['timestamp']).toBe(t2)
    })
  })

  describe('when multiple requests happen concurrently', () => {
    let contentClient: jest.Mocked<SmartContentClient>

    beforeEach(() => {
      contentClient = contentServer()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should calculate definition only once', async () => {
      const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS, refreshTime: '2s' })

      await Promise.all([
        manager.find({ collectionIds: [COLLECTION_ID_1] }),
        manager.find({ collectionIds: [COLLECTION_ID_2] })
      ])

      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([WEARABLE_ID_1, WEARABLE_ID_2])
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([WEARABLE_ID_3])
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledTimes(2)
    })
  })

  describe('when the collection id filter is used', () => {
    let contentClient: jest.Mocked<SmartContentClient>

    beforeEach(() => {
      contentClient = contentServer()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should filter wearables correctly', async () => {
      const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS, refreshTime: '2s' })

      const wearables = await manager.find({ collectionIds: [COLLECTION_ID_1] })

      assertReturnWearablesAre(wearables, WEARABLE_ID_1, WEARABLE_ID_2)
    })
  })

  describe('when the wearable id filter is used', () => {
    let contentClient: jest.Mocked<SmartContentClient>

    beforeEach(() => {
      contentClient = contentServer()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should filter wearables correctly', async () => {
      const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS, refreshTime: '2s' })

      const wearables = await manager.find({ itemIds: [WEARABLE_ID_2, WEARABLE_ID_3] })

      assertReturnWearablesAre(wearables, WEARABLE_ID_2, WEARABLE_ID_3)
    })
  })

  describe('when the text search filter is used', () => {
    let contentClient: jest.Mocked<SmartContentClient>

    beforeEach(() => {
      contentClient = contentServer()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should filter wearables correctly', async () => {
      const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS, refreshTime: '2s' })

      const wearables = await manager.find({ textSearch: 'other' })

      assertReturnWearablesAre(wearables, WEARABLE_ID_2, WEARABLE_ID_3)
    })
  })

  describe('when multiple filters are used', () => {
    let contentClient: jest.Mocked<SmartContentClient>

    beforeEach(() => {
      contentClient = contentServer()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should filter wearables correctly', async () => {
      const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS, refreshTime: '2s' })

      const wearables = await manager.find({ textSearch: 'other', collectionIds: [COLLECTION_ID_1] })

      assertReturnWearablesAre(wearables, WEARABLE_ID_2)
    })
  })
})

function assertReturnWearablesAre(wearables: LambdasWearable[], ...ids: WearableId[]) {
  const returnedIds = new Set(wearables.map(({ id }) => id))
  expect(returnedIds).toEqual(new Set(ids))
}

function contentServer(): jest.Mocked<SmartContentClient> {
  return {
    fetchEntitiesByPointers: jest.fn().mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => buildEntity(id)))
    )
  } as unknown as jest.Mocked<SmartContentClient>
}

function buildEntity(id: WearableId) {
  return {
    id: '',
    version: 'v2',
    type: EntityType.WEARABLE,
    pointers: [id],
    timestamp: 10,
    metadata: buildMetadata(id, 10),
    content: []
  }
}

function buildEntityWithTimestampInMetadata(id: WearableId, timestamp: number): Entity {
  return {
    id: '',
    version: 'v2',
    type: EntityType.WEARABLE,
    pointers: [id],
    timestamp: timestamp,
    metadata: buildMetadata(id, timestamp),
    content: []
  }
}

function buildMetadata(id: WearableId, timestamp: number) {
  return {
    id,
    data: { representations: [] },
    image: undefined,
    thumbnail: undefined,
    i18n: [{ code: 'en', text: id }],
    timestamp
  }
}
