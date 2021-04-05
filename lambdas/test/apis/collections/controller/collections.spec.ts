import { getCollections } from '@katalyst/lambdas/apis/collections/controllers/collections'
import { BASE_AVATARS_COLLECTION_ID } from '@katalyst/lambdas/apis/collections/off-chain/OffChainWearablesManager'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { instance, mock, when } from 'ts-mockito'

const COLLECTION_1 = {
  urn: 'some-urn',
  name: 'some-name'
}

describe('collections', () => {
  it(`When collections are requested, then the base wearables collections is added to on-chain collections`, async () => {
    const { instance: graphClient } = withCollections(COLLECTION_1)

    const response = await getCollections(graphClient)

    expect(response).toEqual([
      { id: BASE_AVATARS_COLLECTION_ID, name: 'Base Wearables' },
      { id: 'some-urn', name: 'some-name' }
    ])
  })
})

function withCollections(...collections: { urn: string; name: string }[]) {
  const mockedClient = mock(TheGraphClient)
  when(mockedClient.getAllCollections()).thenResolve(collections)
  return { instance: instance(mockedClient), mock: mockedClient }
}
