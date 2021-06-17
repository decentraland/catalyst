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
    const l2Url = 'http://someUrl'
    const { fetcher, mockedFetcher } = mockFetcher()

    const accessChecker = buildAccessChecker({
      fetcher,
      collectionsL2SubgraphUrl: l2Url
    })

    await accessChecker.hasAccess(
      EntityType.WEARABLE,
      ['urn:decentraland:mumbai:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'],
      Date.now(),
      'Unused Address'
    )

    verify(mockedFetcher.queryGraph(l2Url, anything(), anything())).once()
  })

  it(`When urn network belongs to L1, then L1 subgraph is used`, async () => {
    const l1Url = 'http://someUrl'
    const { fetcher, mockedFetcher } = mockFetcher()

    const accessChecker = buildAccessChecker({
      fetcher,
      collectionsL1SubgraphUrl: l1Url
    })

    await accessChecker.hasAccess(
      EntityType.WEARABLE,
      ['urn:decentraland:ethereum:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'],
      Date.now(),
      'Unused Address'
    )

    verify(mockedFetcher.queryGraph(l1Url, anything(), anything())).once()
  })

  function buildAccessChecker(params?: Partial<AccessCheckerImplParams>) {
    const finalParams = {
      authenticator: new ContentAuthenticator(),
      fetcher: new Fetcher(),
      landManagerSubgraphUrl: 'Unused URL',
      collectionsL1SubgraphUrl: 'Unused URL',
      collectionsL2SubgraphUrl: 'Unused URL',
      ...params
    }
    return new AccessCheckerImpl(finalParams)
  }

  function mockFetcher() {
    const mockedFetcher = mock(Fetcher)
    when(mockedFetcher.fetchJson(anything(), anything())).thenResolve({ collections: [], items: [] })
    const fetcher = instance(mockedFetcher)
    return { fetcher, mockedFetcher }
  }
})
