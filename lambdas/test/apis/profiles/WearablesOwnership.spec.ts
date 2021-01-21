import { WearableId } from '@katalyst/lambdas/apis/collections/controllers/collections'
import { OwnedWearables, WearablesOwnership } from '@katalyst/lambdas/apis/profiles/WearablesOwnership'
import { DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN } from '@katalyst/lambdas/Environment'
import { Fetcher } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { delay } from 'decentraland-katalyst-utils/util'
import { random } from 'faker'
import { anything, instance, mock, verify, when } from 'ts-mockito'

describe('Wearables Ownership', () => {
  const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
  const WEARABLE_ID_1 = 'someCollection-someWearable'

  it(`When the same address is used, casing is ignored`, async () => {
    const address = '0x079BED9C31CB772c4C156F86E1CFf15bf751ADd0'
    const returnedValue = new Map([[address, [WEARABLE_ID_1]]])
    const { instance } = getMockedFetcher(returnedValue)
    const wearablesOwnership = buildOwnership(instance)

    const resultOriginal = await wearablesOwnership.getWearablesOwnedByAddresses([address])
    const resultUpper = await wearablesOwnership.getWearablesOwnedByAddresses([address.toUpperCase()])
    const resultLower = await wearablesOwnership.getWearablesOwnedByAddresses([address.toUpperCase()])

    assertOwnedWearablesAreAsExpected(resultOriginal, returnedValue)
    assertOwnedWearablesAreAsExpected(resultUpper, returnedValue)
    assertOwnedWearablesAreAsExpected(resultLower, returnedValue)
  })

  it(`When fetching wearables for the first time, then the graph is consulted and updatedAgo is 0`, async () => {
    const returnedValue = new Map([[SOME_ADDRESS, [WEARABLE_ID_1]]])
    const { mock, instance } = getMockedFetcher(returnedValue)
    const wearablesOwnership = buildOwnership(instance)

    const result = await wearablesOwnership.getWearablesOwnedByAddresses([SOME_ADDRESS])

    expect(result.size).toEqual(1)
    expect(result.get(SOME_ADDRESS)?.updatedMillisAgo).toEqual(0)
    verify(mock.queryGraph(anything(), anything(), anything())).once()
  })

  it(`When multiple addresses are consulted, then they are grouped in one query to the graph`, async () => {
    const addresses = buildArrayWithAddresses({ amount: 5 })
    const { mock, instance } = getMockedFetcher()
    const wearablesOwnership = buildOwnership(instance)

    await wearablesOwnership.getWearablesOwnedByAddresses(addresses)

    verify(mock.queryGraph(anything(), anything(), anything())).once()
  })

  it(`When more than WearablesOwnership#REQUESTS_IN_GROUP addresses are consulted, then more than one request is needed`, async () => {
    const addresses = buildArrayWithAddresses({ amount: WearablesOwnership.REQUESTS_IN_GROUP + 1 })
    const { mock, instance } = getMockedFetcher()
    const wearablesOwnership = buildOwnership(instance)

    await wearablesOwnership.getWearablesOwnedByAddresses(addresses)

    verify(mock.queryGraph(anything(), anything(), anything())).twice()
  })

  it(`When the same address is consulted, then the cache is used, the graph is fetched only once and updatedAgo is more than 0`, async () => {
    const returnedValue = new Map([[SOME_ADDRESS, [WEARABLE_ID_1]]])
    const { mock, instance } = getMockedFetcher(returnedValue)
    const wearablesOwnership = buildOwnership(instance)

    await wearablesOwnership.getWearablesOwnedByAddresses([SOME_ADDRESS])
    await delay(1) // We wait 1 ms, so that we can make sure that 'updateAgo' is modified
    const secondCallResult = await wearablesOwnership.getWearablesOwnedByAddresses([SOME_ADDRESS])

    expect(secondCallResult.size).toEqual(1)
    expect(secondCallResult.get(SOME_ADDRESS)?.updatedMillisAgo).toBeGreaterThan(0)

    verify(mock.queryGraph(anything(), anything(), anything())).once()
  })
})

function buildArrayWithAddresses(options: { amount: number }): EthAddress[] {
  return Array.from({ length: options.amount }, () => random.alphaNumeric(10))
}

function assertOwnedWearablesAreAsExpected(returned: OwnedWearables, expected: Map<EthAddress, WearableId[]>) {
  expect(returned.size).toEqual(expected.size)

  for (const [ethAddress, expectedWearables] of expected) {
    const returnedWearables = returned.get(ethAddress.toLowerCase())!.wearables // Returned addresses are always lowercase
    expect(returnedWearables).toEqual(new Set(expectedWearables))
  }
}

function buildOwnership(fetcher: Fetcher) {
  return new WearablesOwnership(DEFAULT_ENS_OWNER_PROVIDER_URL_ROPSTEN, fetcher, 500, 1000)
}

function getMockedFetcher(returnedValues: Map<EthAddress, WearableId[]> = new Map()) {
  const returnValue = {}
  Array.from(returnedValues.entries()).forEach(([ethAddress, wearables]) => {
    returnValue[`P${ethAddress.toLowerCase()}`] = wearables.map((wearableId) => ({ catalystPointer: wearableId }))
  })
  const mockedFetcher: Fetcher = mock(Fetcher)
  when(mockedFetcher.queryGraph(anything(), anything(), anything())).thenResolve(returnValue)
  return { mock: mockedFetcher, instance: instance(mockedFetcher) }
}
