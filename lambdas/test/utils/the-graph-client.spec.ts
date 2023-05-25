import { ISubgraphComponent } from '@well-known-components/thegraph-component'
import { createTheGraphClient } from '../../src/ports/the-graph-client'

describe('The Graph Client', () => {
  it('should iterate until all assets have been fetched', async () => {
    const subgraphs = {
      ensSubgraph: jest.fn() as any as ISubgraphComponent,
      collectionsSubgraph: { query: jest.fn() },
      maticCollectionsSubgraph: { query: jest.fn() },
      thirdPartyRegistrySubgraph: jest.fn() as any as ISubgraphComponent
    }

    subgraphs.collectionsSubgraph.query.mockResolvedValueOnce({
      nfts: []
    })
    subgraphs.maticCollectionsSubgraph.query
      .mockResolvedValueOnce(require('../__fixtures__/wearables-by-owner-matic-p1.json'))
      .mockResolvedValueOnce(require('../__fixtures__/wearables-by-owner-matic-p2.json'))

    const theGraphClient = await createTheGraphClient({
      subgraphs,
      log: {
        getLogger: () => ({
          error: () => {},
          log: () => {},
          warn: () => {},
          debug: () => {},
          info: () => {}
        })
      }
    })
    const assets = await theGraphClient.findWearableUrnsByOwner('0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198')

    expect(subgraphs.collectionsSubgraph.query).toHaveBeenCalledTimes(1)
    expect(subgraphs.maticCollectionsSubgraph.query).toHaveBeenCalledTimes(2)
    expect(assets).toHaveLength(1001)
  })
})
