import { NFTOwnership } from '../../../src/apis/profiles/NFTOwnership'

const address = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'

describe('NFTOwnership', () => {
  it(`When getting owned nfts, then case is ignored`, async () => {
    const nftOwnership = buildOwnership()

    const nftsOriginal = await nftOwnership.areNFTsOwnedByAddress(address, ['marcosnc', 'invalid_name'])
    assertNamesAreOwned(nftsOriginal, 'marcosnc')
    assertNamesAreNotOwned(nftsOriginal, 'invalid_name')

    const nftsUpper = await nftOwnership.areNFTsOwnedByAddress(address.toUpperCase(), ['marcosnc', 'invalid_name'])
    expect(nftsUpper).toEqual(nftsOriginal)

    const nftsLower = await nftOwnership.areNFTsOwnedByAddress(address.toLowerCase(), ['marcosnc', 'invalid_name'])
    expect(nftsLower).toEqual(nftsOriginal)
  })

  it(`When getting the owned nfts for the first time, then the graph is consulted`, async () => {
    const nftOwnership = buildOwnership()

    await nftOwnership.areNFTsOwnedByAddress(address, ['marcosnc', 'invalid_name'])

    expect(nftOwnership.timesQueried()).toEqual(1)
  })

  it(`When getting the owned nfts with different nfts, then the graph is consulted twice`, async () => {
    const nftOwnership = buildOwnership()

    await nftOwnership.areNFTsOwnedByAddress(address, ['marcosnc', 'invalid_name'])
    await nftOwnership.areNFTsOwnedByAddress(address, ['another_name'])

    expect(nftOwnership.timesQueried()).toEqual(2)
  })

  it(`When getting the same owned nfts twice, then the graph is consulted once`, async () => {
    const nftOwnership = buildOwnership()

    await nftOwnership.areNFTsOwnedByAddress(address, ['marcosnc', 'invalid_name'])
    await nftOwnership.areNFTsOwnedByAddress(address, ['marcosnc', 'invalid_name'])

    expect(nftOwnership.timesQueried()).toEqual(1)
  })

  it(`When getting the same owned nfts for a different address, then the graph is consulted twice`, async () => {
    const nftOwnership = buildOwnership()

    await nftOwnership.areNFTsOwnedByAddress(address, ['marcosnc', 'invalid_name'])
    await nftOwnership.areNFTsOwnedByAddress('anotherAddress', ['marcosnc'])

    expect(nftOwnership.timesQueried()).toEqual(2)
  })

  it(`When subgraph query fails, then nfts are considered as owned, but they are not cached`, async () => {
    const nftOwnership = new FailingOwnership(500, 1000)
    const nftId = 'unowned_nft'

    const ownership = await nftOwnership.areNFTsOwnedByAddress(address, [nftId])
    const ownership2 = await nftOwnership.areNFTsOwnedByAddress(address, [nftId])

    expect(ownership.get(nftId)).toBeTruthy()
    expect(ownership2.get(nftId)).toBeTruthy()
    expect(nftOwnership.timesQueried()).toEqual(2)
  })
})

function assertNamesAreOwned(result: Map<string, boolean>, ...names: string[]) {
  for (const name of names) {
    expect(result.get(name)).toEqual(true)
  }
}
function assertNamesAreNotOwned(result: Map<string, boolean>, ...names: string[]) {
  for (const name of names) {
    expect(result.get(name)).toEqual(false)
  }
}

function buildOwnership() {
  return new TestOwnership(500, 1000)
}

class TestOwnership extends NFTOwnership {
  private queried = 0

  protected querySubgraph(nftsToCheck: [string, string[]][]): Promise<{ ownedNFTs: string[]; owner: string }[]> {
    this.queried++
    return Promise.resolve([
      { ownedNFTs: ['marcosnc'], owner: address.toLowerCase() },
      { ownedNFTs: [], owner: 'anotheraddress' }
    ])
  }

  public timesQueried(): number {
    return this.queried
  }
}

class FailingOwnership extends NFTOwnership {
  private queried = 0

  protected querySubgraph(nftsToCheck: [string, string[]][]): Promise<{ ownedNFTs: string[]; owner: string }[]> {
    this.queried++
    return Promise.reject('Failed to query the subgraph')
  }

  public timesQueried(): number {
    return this.queried
  }
}
