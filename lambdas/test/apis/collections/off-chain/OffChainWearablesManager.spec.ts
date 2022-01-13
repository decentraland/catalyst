import { EntityType, EntityVersion } from 'dcl-catalyst-commons'
import { anything, deepEqual, instance, mock, objectContaining, resetCalls, verify, when } from 'ts-mockito'
import { OffChainWearablesManager } from '../../../../src/apis/collections/off-chain/OffChainWearablesManager'
import { Wearable, WearableId } from '../../../../src/apis/collections/types'
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

  it(`When definitions are loaded for the first time, then content server is queried`, async () => {
    const { instance: contentClient, mock: contentClientMock } = contentServer()
    const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS })

    await manager.find({ collectionIds: [COLLECTION_ID_1] })

    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_1, WEARABLE_ID_2)
    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_3)
  })

  it(`When expire time ends, then the content server is called again`, async () => {
    const { instance: contentClient, mock: contentClientMock } = contentServer()
    const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS, refreshTime: '2s' })

    await manager.find({ collectionIds: [COLLECTION_ID_1] })

    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_1, WEARABLE_ID_2)
    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_3)

    resetCalls(contentClientMock)
    jest.runOnlyPendingTimers()
    // Althouth the find method isn't the one that triggers the update, it is needed for process to run the next tick
    await manager.find({ collectionIds: [COLLECTION_ID_1] })
    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_1, WEARABLE_ID_2)
    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_3)
  })

  it(`When expire time ends, new objects are fetched from the content server`, async () => {
    jest.useFakeTimers('legacy')
    const contentClientMock = mock(SmartContentClient)
    const contentClient = instance(contentClientMock)
    const t1 = 1
    const t2 = 2

    when(contentClientMock.fetchEntitiesByPointers(anything(), objectContaining([WEARABLE_ID_3])))
      .thenResolve([buildEntityWithTimestampInMetadata(WEARABLE_ID_3, t1)])
      .thenResolve([buildEntityWithTimestampInMetadata(WEARABLE_ID_3, t2)])

    const manager = new OffChainWearablesManager({ client: contentClient, collections: {[COLLECTION_ID_2]: [WEARABLE_ID_3]}, refreshTime: '2s' })

    const firstWearables = await manager.find({ collectionIds: [COLLECTION_ID_2] })
    expect(firstWearables.length).toBe(1)
    expect(firstWearables[0].id).toBe(WEARABLE_ID_3)
    expect(firstWearables[0]['timestamp']).toBe(t1)

    resetCalls(contentClientMock)
    jest.advanceTimersByTime(2000)
    // Needed to finish the promise in the TimeRefreshedDataHolder that calls the content server
    await new Promise(process.nextTick);
    const secondWearables = await manager.find({ collectionIds: [COLLECTION_ID_2] })
    expect(secondWearables.length).toBe(1)
    expect(secondWearables[0].id).toBe(WEARABLE_ID_3)
    expect(secondWearables[0]['timestamp']).toBe(t2)
  })

  it(`When multiple requests happen concurrently, then definition is only calculated once`, async () => {
    const { instance: contentClient, mock: contentClientMock } = contentServer()
    const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS })

    await Promise.all([
      manager.find({ collectionIds: [COLLECTION_ID_1] }),
      manager.find({ collectionIds: [COLLECTION_ID_2] })
    ])

    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_1, WEARABLE_ID_2)
    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_3)
  })

  it(`When the collection id filter is used, then wearables are filtered correctly`, async () => {
    const { instance: contentClient } = contentServer()
    const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS })

    const wearables = await manager.find({ collectionIds: [COLLECTION_ID_1] })

    assertReturnWearablesAre(wearables, WEARABLE_ID_1, WEARABLE_ID_2)
  })

  it(`When the wearable id filter is used, then wearables are filtered correctly`, async () => {
    const { instance: contentClient } = contentServer()
    const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS })

    const wearables = await manager.find({ wearableIds: [WEARABLE_ID_2, WEARABLE_ID_3] })

    assertReturnWearablesAre(wearables, WEARABLE_ID_2, WEARABLE_ID_3)
  })

  it(`When the text search filter is used, then wearables are filtered correctly`, async () => {
    const { instance: contentClient } = contentServer()
    const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS })

    const wearables = await manager.find({ textSearch: 'other' })

    assertReturnWearablesAre(wearables, WEARABLE_ID_2, WEARABLE_ID_3)
  })

  it(`When multiple filters are used, then wearables are filtered correctly`, async () => {
    const { instance: contentClient } = contentServer()
    const manager = new OffChainWearablesManager({ client: contentClient, collections: COLLECTIONS })

    const wearables = await manager.find({ textSearch: 'other', collectionIds: [COLLECTION_ID_1] })

    assertReturnWearablesAre(wearables, WEARABLE_ID_2)
  })
})

function assertReturnWearablesAre(wearables: Wearable[], ...ids: WearableId[]) {
  const returnedIds = new Set(wearables.map(({ id }) => id))
  expect(returnedIds).toEqual(new Set(ids))
}

function assertContentServerWasCalledOnceWithIds(contentClient: SmartContentClient, ...ids: WearableId[]) {
  verify(contentClient.fetchEntitiesByPointers(EntityType.WEARABLE, deepEqual(ids))).once()
}

function contentServer() {
  const mockedClient = mock(SmartContentClient)
  when(mockedClient.fetchEntitiesByPointers(anything(), anything())).thenCall((_, ids) =>
    Promise.resolve(ids.map((id) => buildEntity(id)))
  )
  return { instance: instance(mockedClient), mock: mockedClient }
}

function buildEntity(id: WearableId) {
  return {
    id: '',
    version: EntityVersion.V2,
    type: EntityType.WEARABLE,
    pointers: [id],
    timestamp: 10,
    metadata: buildMetadata(id, 10)
  }
}

function buildEntityWithTimestampInMetadata(id: WearableId, timestamp: number) {
  return {
    id: '',
    version: EntityVersion.V2,
    type: EntityType.WEARABLE,
    pointers: [id],
    timestamp: timestamp,
    metadata: buildMetadata(id, timestamp)
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
