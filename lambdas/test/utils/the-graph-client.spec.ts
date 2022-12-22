import { TheGraphClient } from '../../src/utils/TheGraphClient'
import { ISubgraphComponent } from '@well-known-components/thegraph-component'

describe('The Graph Client', () => {
  it('should iterate until all assets have been fetched', async () => {
    const subGraphs = {
      ensSubgraph: jest.fn() as any as ISubgraphComponent,
      collectionsSubgraph: { query: jest.fn() },
      maticCollectionsSubgraph: { query: jest.fn() },
      thirdPartyRegistrySubgraph: jest.fn() as any as ISubgraphComponent
    }

    subGraphs.collectionsSubgraph.query.mockResolvedValueOnce({
      nfts: []
    })
    subGraphs.maticCollectionsSubgraph.query
      .mockResolvedValueOnce(require('../__fixtures__/wearables-by-owner-matic-p1.json'))
      .mockResolvedValueOnce(require('../__fixtures__/wearables-by-owner-matic-p2.json'))

    const theGraphClient = new TheGraphClient(subGraphs)
    const assets = await theGraphClient.findWearableUrnsByOwner('0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198')

    expect(subGraphs.collectionsSubgraph.query).toHaveBeenCalledTimes(1)
    expect(subGraphs.maticCollectionsSubgraph.query).toHaveBeenCalledTimes(2)
    expect(assets).toHaveLength(1001)
  })
})
