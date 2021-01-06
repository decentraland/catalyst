import { Fetcher } from 'dcl-catalyst-commons'
import { anything, instance, mock, verify, when } from 'ts-mockito'
import { ENSFilter } from '../../../src/apis/profiles/ensFiltering'
import { DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN } from '../../../src/Environment'

describe('Ensure ENS filtering work as expected', () => {
  it(`Ensure Address case is ignored when retrieving ENS`, async () => {
    const fetcher: Fetcher = new Fetcher()
    const ensFilter = new ENSFilter(500, 1000)

    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'

    const namesOriginal = await ensFilter.filter(fetcher, DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress, [
      'marcosnc',
      'invalid_name'
    ])
    expect(namesOriginal.length).toEqual(1)

    const namesUpper = await ensFilter.filter(
      fetcher,
      DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN,
      originalAddress.toUpperCase(),
      ['marcosnc', 'invalid_name']
    )
    expect(namesUpper).toEqual(namesOriginal)

    const namesLower = await ensFilter.filter(
      fetcher,
      DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN,
      originalAddress.toLowerCase(),
      ['marcosnc', 'invalid_name']
    )
    expect(namesLower).toEqual(namesOriginal)
  }, 100000)

  it(`When getting the owned names for the first time, then the graph is consulted`, async () => {
    const mockedFetcher: Fetcher = getMockedFetcher()
    const fetcher: Fetcher = instance(mockedFetcher)
    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'
    const ensFilter = new ENSFilter(500, 1000)

    await ensFilter.filter(fetcher, DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress, [
      'marcosnc',
      'invalid_name'
    ])

    verify(mockedFetcher.queryGraph(anything(), anything(), anything())).once()
  }, 100000)

  it(`When getting the owned names with different listed names, then the graph is consulted`, async () => {
    const mockedFetcher: Fetcher = getMockedFetcher()
    const fetcher: Fetcher = instance(mockedFetcher)
    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'
    const ensFilter = new ENSFilter(500, 1000)

    await ensFilter.filter(fetcher, DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress, [
      'marcosnc',
      'invalid_name'
    ])

    await ensFilter.filter(fetcher, DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress, [
      'marcosnc',
      'invalid_name',
      'another_name'
    ])
    verify(mockedFetcher.queryGraph(anything(), anything(), anything())).times(2)
  }, 100000)

  it(`When getting the owned names twice, then the graph is consulted once`, async () => {
    const mockedFetcher: Fetcher = getMockedFetcher()
    const fetcher: Fetcher = instance(mockedFetcher)
    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'
    const ensFilter = new ENSFilter(500, 1000)

    await ensFilter.filter(fetcher, DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress, [
      'marcosnc',
      'invalid_name'
    ])
    await ensFilter.filter(fetcher, DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress, [
      'marcosnc',
      'invalid_name'
    ])

    verify(mockedFetcher.queryGraph(anything(), anything(), anything())).once()
  }, 100000)

  it(`When getting the owned names for a different entity, then the graph is consulted twice`, async () => {
    const mockedFetcher: Fetcher = getMockedFetcher()
    const fetcher: Fetcher = instance(mockedFetcher)
    const originalAddress = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'
    const ensFilter = new ENSFilter(500, 1000)

    await ensFilter.filter(fetcher, DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, originalAddress, [
      'marcosnc',
      'invalid_name'
    ])

    await ensFilter.filter(fetcher, DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, 'anotherAddress', ['marcosnc'])
    verify(mockedFetcher.queryGraph(anything(), anything(), anything())).times(2)
  }, 100000)
})
function getMockedFetcher() {
  const mockedFetcher: Fetcher = mock(Fetcher)
  when(mockedFetcher.queryGraph(anything(), anything(), anything())).thenResolve({
    nfts: [{ name: 'marcosnc' }]
  })
  return mockedFetcher
}
