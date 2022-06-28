import { TheGraphClient } from '../../src/utils/TheGraphClient'
import { Fetcher } from 'dcl-catalyst-commons'
import sinon from 'sinon'

describe('The Graph Client', () => {
  it('should iterate until all assets have been fetched', async () => {
    const stub = sinon.stub()
    stub.withArgs('collectionsSubgraph', sinon.match.any, sinon.match.any).resolves({
      nfts: []
    })
    stub
      .withArgs('maticCollectionsSubgraph', sinon.match.any, sinon.match.any)
      .onFirstCall()
      .resolves(require('../__fixtures__/wearables-by-owner-matic-p1.json'))
      .onSecondCall()
      .resolves(require('../__fixtures__/wearables-by-owner-matic-p2.json'))

    const fetcher = new Fetcher()
    fetcher.queryGraph = stub

    let urls = {
      ensSubgraph: 'ensSubgraph',
      collectionsSubgraph: 'collectionsSubgraph',
      maticCollectionsSubgraph: 'maticCollectionsSubgraph',
      thirdPartyRegistrySubgraph: 'thirdPartyRegistrySubgraph'
    }
    const theGraphClient = new TheGraphClient(urls, fetcher)
    const assets = await theGraphClient.findWearablesByOwner('0x6a77883ed4E65a1DF591FdA2f5252FD7c548f198')

    expect(assets).toHaveLength(1001)
  })
})
