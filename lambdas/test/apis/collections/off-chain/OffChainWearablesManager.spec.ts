import { OffChainWearablesManager } from '@katalyst/lambdas/apis/collections/off-chain/OffChainWearablesManager'
import { Wearable, WearableId } from '@katalyst/lambdas/apis/collections/types'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { EntityType } from 'dcl-catalyst-commons'
import { delay } from 'decentraland-katalyst-utils/util'
import ms from 'ms'
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito'

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
    await delay(ms('2s'))

    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_1, WEARABLE_ID_2)
    assertContentServerWasCalledOnceWithIds(contentClientMock, WEARABLE_ID_3)
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
    type: EntityType.WEARABLE,
    pointers: [id],
    timestamp: 10,
    metadata: buildMetadata(id)
  }
}

function buildMetadata(id: WearableId) {
  return {
    id,
    data: { representations: [] },
    image: undefined,
    thumbnail: undefined,
    i18n: [{ code: 'en', text: id }]
  }
}
