import { Fetcher } from 'dcl-catalyst-commons'
import { anything, instance, mock, verify, when } from 'ts-mockito'
import { EnsOwnership } from '../../../src/apis/profiles/EnsOwnership'
import { DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN } from '../../../src/Environment'

describe('Ensure ENS filtering work as expected', () => {
  it(`Ensure Address case is ignored when retrieving ENS`, async () => {
    const fetcher: Fetcher = new Fetcher()
    const ensOwnership = buildOwnership(fetcher)

    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'

    const namesOriginal = await ensOwnership.areNamesOwnedByAddress(originalAddress, ['marcosnc', 'invalid_name'])
    assertNamesAreOwned(namesOriginal, 'marcosnc')
    assertNamesAreNotOwned(namesOriginal, 'invalid_name')

    const namesUpper = await ensOwnership.areNamesOwnedByAddress(originalAddress.toUpperCase(), [
      'marcosnc',
      'invalid_name'
    ])
    expect(namesUpper).toEqual(namesOriginal)

    const namesLower = await ensOwnership.areNamesOwnedByAddress(originalAddress.toLowerCase(), [
      'marcosnc',
      'invalid_name'
    ])
    expect(namesLower).toEqual(namesOriginal)
  }, 100000)

  it(`When getting the owned names for the first time, then the graph is consulted`, async () => {
    const mockedFetcher: Fetcher = getMockedFetcher()
    const fetcher: Fetcher = instance(mockedFetcher)
    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'
    const ensOwnership = buildOwnership(fetcher)

    await ensOwnership.areNamesOwnedByAddress(originalAddress, ['marcosnc', 'invalid_name'])

    verify(mockedFetcher.queryGraph(anything(), anything(), anything())).once()
  }, 100000)

  it(`When getting the owned names with different listed names, then the graph is consulted`, async () => {
    const mockedFetcher: Fetcher = getMockedFetcher()
    const fetcher: Fetcher = instance(mockedFetcher)
    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'
    const ensOwnership = buildOwnership(fetcher)

    await ensOwnership.areNamesOwnedByAddress(originalAddress, ['marcosnc', 'invalid_name'])
    await ensOwnership.areNamesOwnedByAddress(originalAddress, ['marcosnc', 'invalid_name', 'another_name'])

    verify(mockedFetcher.queryGraph(anything(), anything(), anything())).times(2)
  }, 100000)

  it(`When getting the owned names twice, then the graph is consulted once`, async () => {
    const mockedFetcher: Fetcher = getMockedFetcher()
    const fetcher: Fetcher = instance(mockedFetcher)
    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'
    const ensOwnership = buildOwnership(fetcher)

    await ensOwnership.areNamesOwnedByAddress(originalAddress, ['marcosnc', 'invalid_name'])
    await ensOwnership.areNamesOwnedByAddress(originalAddress, ['marcosnc', 'invalid_name'])

    verify(mockedFetcher.queryGraph(anything(), anything(), anything())).once()
  }, 100000)

  it(`When getting the owned names for a different entity, then the graph is consulted once`, async () => {
    const mockedFetcher: Fetcher = getMockedFetcher()
    const fetcher: Fetcher = instance(mockedFetcher)
    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'
    const ensOwnership = buildOwnership(fetcher)

    await ensOwnership.areNamesOwnedByAddress(originalAddress, ['marcosnc', 'invalid_name'])
    await ensOwnership.areNamesOwnedByAddress('anotherAddress', ['marcosnc'])

    verify(mockedFetcher.queryGraph(anything(), anything(), anything())).once()
  }, 100000)
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

function buildOwnership(fetcher: Fetcher) {
  return new EnsOwnership(DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, fetcher, 500, 1000)
}

function getMockedFetcher() {
  const mockedFetcher: Fetcher = mock(Fetcher)
  when(mockedFetcher.queryGraph(anything(), anything(), anything())).thenResolve({
    nfts: [{ name: 'marcosnc' }]
  })
  return mockedFetcher
}
