import { getCollections } from '../../../../src/apis/collections/controllers/collections'
import { BASE_AVATARS_COLLECTION_ID } from '../../../../src/apis/collections/off-chain/OffChainWearablesManager'

const COLLECTION_1 = {
  urn: 'some-urn',
  name: 'some-name'
}

describe('collections', () => {
  it(`When collections are requested, then the base wearables collections is added to on-chain collections`, async () => {
    const mockedGraphClient = withCollections(COLLECTION_1)

    const response = await getCollections(mockedGraphClient as any)

    expect(response).toEqual([
      { id: BASE_AVATARS_COLLECTION_ID, name: 'Base Wearables' },
      { id: 'some-urn', name: 'some-name' }
    ])
  })
})

function withCollections(...collections: { urn: string; name: string }[]) {
  return {
    getAllCollections: jest.fn().mockResolvedValue(collections)
  }
}
