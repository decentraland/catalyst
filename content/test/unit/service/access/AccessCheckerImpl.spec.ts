import { AccessCheckerImpl, AccessCheckerImplParams } from '@katalyst/content/service/access/AccessCheckerImpl'
import { ContentAuthenticator } from '@katalyst/content/service/auth/Authenticator'
import { EntityType, Fetcher } from 'dcl-catalyst-commons'
import { DECENTRALAND_ADDRESS } from 'decentraland-katalyst-commons/addresses'
import { anything, instance, mock, verify, when } from 'ts-mockito'

describe('AccessCheckerImpl', function () {
  it(`When a non-decentraland address tries to deploy an default scene, then an error is returned`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.hasAccess(EntityType.SCENE, ['Default10'], Date.now(), '0xAddress')

    expect(errors).toContain('Only Decentraland can add or modify default scenes')
  })

  it(`When a decentraland address tries to deploy an default scene, then it is allowed`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.hasAccess(EntityType.SCENE, ['Default10'], Date.now(), DECENTRALAND_ADDRESS)

    expect(errors.length).toBe(0)
  })

  it(`When a non-decentraland address tries to deploy an default profile, then an error is returned`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.hasAccess(EntityType.PROFILE, ['Default10'], Date.now(), '0xAddress')

    expect(errors).toContain('Only Decentraland can add or modify default profiles')
  })

  it(`When a decentraland address tries to deploy an default profile, then it is allowed`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.hasAccess(EntityType.PROFILE, ['Default10'], Date.now(), DECENTRALAND_ADDRESS)

    expect(errors.length).toBe(0)
  })

  it(`Invalid Wearables pointers are reported as errors`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await accessChecker.hasAccess(EntityType.WEARABLE, ['Invalid_pointer'], Date.now(), 'Unused Address')

    expect(errors).toContain(
      'Wearable pointers should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (invalid_pointer)'
    )
  })

  it(`When urn network belongs to L2, then L2 subgraph is used`, async () => {
    const collectionsL2Url = 'http://someUrl'
    const blocksL2Url = 'http://blocksUrl'
    const address = 'address'
    const { fetcher, mockedFetcher } = mockedFetcherWithAccess(address)

    const accessChecker = buildAccessChecker({
      fetcher,
      collectionsL2SubgraphUrl: collectionsL2Url,
      blocksL2SubgraphUrl: blocksL2Url
    })

    await accessChecker.hasAccess(
      EntityType.WEARABLE,
      ['urn:decentraland:mumbai:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'],
      Date.now(),
      address
    )

    verify(mockedFetcher.queryGraph(blocksL2Url, anything(), anything())).once()
    verify(mockedFetcher.queryGraph(collectionsL2Url, anything(), anything())).once()
  })

  it(`When urn network belongs to L1, then L1 subgraph is used`, async () => {
    const collectionsL1Url = 'http://someUrl'
    const blocksL1Url = 'http://blocksUrl'
    const address = 'address'
    const { fetcher, mockedFetcher } = mockedFetcherWithAccess(address)

    const accessChecker = buildAccessChecker({
      fetcher,
      collectionsL1SubgraphUrl: collectionsL1Url,
      blocksL1SubgraphUrl: blocksL1Url
    })

    await accessChecker.hasAccess(
      EntityType.WEARABLE,
      ['urn:decentraland:ethereum:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'],
      Date.now(),
      address
    )

    verify(mockedFetcher.queryGraph(blocksL1Url, anything(), anything())).once()
    verify(mockedFetcher.queryGraph(collectionsL1Url, anything(), anything())).once()
  })

  it(`When urn network belongs to L2, and address doesn't have access, then L2 subgraph is used twice`, async () => {
    const collectionsL2Url = 'http://someUrl'
    const blocksL2Url = 'http://blocksUrl'
    const { fetcher, mockedFetcher } = mockFetcher()

    const accessChecker = buildAccessChecker({
      fetcher,
      collectionsL2SubgraphUrl: collectionsL2Url,
      blocksL2SubgraphUrl: blocksL2Url
    })

    await accessChecker.hasAccess(
      EntityType.WEARABLE,
      ['urn:decentraland:mumbai:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'],
      Date.now(),
      'Unused Address'
    )

    verify(mockedFetcher.queryGraph(blocksL2Url, anything(), anything())).once()
    verify(mockedFetcher.queryGraph(collectionsL2Url, anything(), anything())).twice()
  })

  it(`When urn network belongs to L1, and address doesn't have access, then L1 subgraph is used twice`, async () => {
    const collectionsL1Url = 'http://someUrl'
    const blocksL1Url = 'http://blocksUrl'
    const { fetcher, mockedFetcher } = mockFetcher()

    const accessChecker = buildAccessChecker({
      fetcher,
      collectionsL1SubgraphUrl: collectionsL1Url,
      blocksL1SubgraphUrl: blocksL1Url
    })

    await accessChecker.hasAccess(
      EntityType.WEARABLE,
      ['urn:decentraland:ethereum:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'],
      Date.now(),
      'Unused Address'
    )

    verify(mockedFetcher.queryGraph(blocksL1Url, anything(), anything())).once()
    verify(mockedFetcher.queryGraph(collectionsL1Url, anything(), anything())).twice()
  })

  function buildAccessChecker(params?: Partial<AccessCheckerImplParams>) {
    const finalParams = {
      authenticator: new ContentAuthenticator(),
      fetcher: new Fetcher(),
      landManagerSubgraphUrl: 'Unused URL',
      collectionsL1SubgraphUrl: 'Unused URL',
      collectionsL2SubgraphUrl: 'Unused URL',
      blocksL1SubgraphUrl: 'Unused URL',
      blocksL2SubgraphUrl: 'Unused URL',
      ...params
    }
    return new AccessCheckerImpl(finalParams)
  }

  function mockFetcher(creator?: string) {
    const mockedFetcher = mock(Fetcher)
    when(mockedFetcher.queryGraph(anything(), anything(), anything())).thenCall((url) => {
      if (url.includes('block')) {
        return Promise.resolve({ after: [{ number: 10 }], fiveMin: [{ number: 5 }] })
      } else {
        return Promise.resolve({ collections: [{ creator }], items: [] })
      }
    })

    const fetcher = instance(mockedFetcher)
    return { fetcher, mockedFetcher }
  }

  function mockedFetcherWithAccess(creator: string) {
    return mockFetcher(creator)
  }
})
