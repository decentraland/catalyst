import { instance, mock, when } from 'ts-mockito'
import { getCollections } from '../../../../src/apis/collections/controllers/collections'
import { BASE_AVATARS_COLLECTION_ID } from '../../../../src/apis/collections/off-chain/OffChainWearablesManager'
import { TheGraphClient } from '../../../../src/utils/TheGraphClient'

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
