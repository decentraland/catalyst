import { DECENTRALAND_ADDRESS } from '@catalyst/commons'
import { ContentFileHash, EntityVersion, Fetcher, Hashing, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Logger } from 'log4js'
import { anything, instance, mock, verify, when } from 'ts-mockito'
import { AccessCheckerForWearables, WearableCollection } from '../../../../src/service/access/AccessCheckerForWearables'
import { AccessCheckerImplParams } from '../../../../src/service/access/AccessCheckerImpl'

describe('AccessCheckerForWearables', () => {
  const COMMITTEE_MEMBER = '0x...'

  it(`When non-urns are used as pointers, then validation fails`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers: ['invalid_pointer'] })

    expect(errors).toEqual([
      'Wearable pointers should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (invalid_pointer)'
    ])
  })

  it(`When there is more than one pointer set, then validation fails`, async () => {
    const pointers = [
      'urn:decentraland:ethereum:collections-v1:atari_launch:a',
      'urn:decentraland:ethereum:collections-v1:atari_launch:b'
    ]
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers })

    expect(errors).toEqual([`Only one pointer is allowed when you create a Wearable. Received: ${pointers}`])
  })

  it(`When several pointers resolve to the same URN then accept both but fail with the access`, async () => {
    const pointers = [
      'urn:decentraland:ethereum:collections-v1:atari_launch:atari_red_upper_body',
      'urn:decentraland:ethereum:collections-v1:0x4c290f486bae507719c562b6b524bdb71a2570c9:atari_red_upper_body'
    ]
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers })

    expect(errors).toEqual([
      `The provided Eth Address 'some address' does not have access to the following wearable: 'urn:decentraland:ethereum:collections-v1:atari_launch:atari_red_upper_body'`
    ])
  })

  it(`When several pointers resolve to the same URN then accept both 2`, async () => {
    const pointers = [
      'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body',
      'urn:decentraland:ethereum:collections-v1:0x574f64ac2e7215cba9752b85fc73030f35166bc0:dgtble_hoodi_linetang_upper_body'
    ]
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers })

    expect(errors).toEqual([
      `The provided Eth Address 'some address' does not have access to the following wearable: 'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body'`
    ])
  })

  it(`When pointer resolves to L1 fails with invalid address`, async () => {
    const pointers = [
      'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body'
    ]
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers })

    expect(errors).toEqual([
      `The provided Eth Address 'some address' does not have access to the following wearable: 'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body'`
    ])
  })

  it(`When pointer resolves to L1 succeeds with valid address`, async () => {
    const pointers = [
      'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body'
    ]
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers, ethAddress: DECENTRALAND_ADDRESS})

    expect(errors).toEqual([])
  })

  it(`when pointer resolves to base-avatar then it resolves okay but fails with invalid eth address`, async () => {
    const pointers = ['urn:decentraland:off-chain:base-avatars:BaseFemale']
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers })

    expect(errors).toEqual([
      "The provided Eth Address 'some address' does not have access to the following wearable: 'urn:decentraland:off-chain:base-avatars:BaseFemale'"])
  })

  it(`when pointer resolves to base-avatar then it resolves okay only with decentraland address`, async () => {
    const pointers = ['urn:decentraland:off-chain:base-avatars:BaseFemale']
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers, ethAddress: DECENTRALAND_ADDRESS })

    expect(errors).toEqual([])
  })

  describe('Correct subgraph use', () => {
    it(`When urn network belongs to L2, then L2 subgraph is used`, async () => {
      const collectionsL2Url = 'http://someUrl'
      const blocksL2Url = 'http://blocksUrl'
      const ethAddress = 'address'
      const { fetcher, mockedFetcher } = fetcherWithValidCollectionAndCreator(ethAddress)

      const accessChecker = buildAccessChecker({
        fetcher,
        collectionsL2SubgraphUrl: collectionsL2Url,
        blocksL2SubgraphUrl: blocksL2Url
      })

      await checkAccess(accessChecker, {
        pointers: ['urn:decentraland:mumbai:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'],
        ethAddress
      })

      verify(mockedFetcher.queryGraph(blocksL2Url, anything(), anything())).once()
      verify(mockedFetcher.queryGraph(collectionsL2Url, anything(), anything())).once()
    })

    it(`When urn network belongs to L1, then L1 subgraph is used`, async () => {
      const collectionsL1Url = 'http://someUrl'
      const blocksL1Url = 'http://blocksUrl'
      const ethAddress = 'address'
      const { fetcher, mockedFetcher } = fetcherWithValidCollectionAndCreator(ethAddress)

      const accessChecker = buildAccessChecker({
        fetcher,
        collectionsL1SubgraphUrl: collectionsL1Url,
        blocksL1SubgraphUrl: blocksL1Url
      })

      await checkAccess(accessChecker, {
        pointers: ['urn:decentraland:ethereum:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'],
        ethAddress
      })

      verify(mockedFetcher.queryGraph(blocksL1Url, anything(), anything())).once()
      verify(mockedFetcher.queryGraph(collectionsL1Url, anything(), anything())).once()
    })

    it(`When urn network belongs to L2, and address doesn't have access, then L2 subgraph is used twice`, async () => {
      const collectionsL2Url = 'http://someUrl'
      const blocksL2Url = 'http://blocksUrl'
      const { fetcher, mockedFetcher } = fetcherWithoutAccess()

      const accessChecker = buildAccessChecker({
        fetcher,
        collectionsL2SubgraphUrl: collectionsL2Url,
        blocksL2SubgraphUrl: blocksL2Url
      })

      await checkAccess(accessChecker, {
        pointers: ['urn:decentraland:mumbai:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1']
      })

      verify(mockedFetcher.queryGraph(blocksL2Url, anything(), anything())).once()
      verify(mockedFetcher.queryGraph(collectionsL2Url, anything(), anything())).twice()
    })

    it(`When urn network belongs to L1, and address doesn't have access, then L1 subgraph is used twice`, async () => {
      const collectionsL1Url = 'http://someUrl'
      const blocksL1Url = 'http://blocksUrl'
      const { fetcher, mockedFetcher } = fetcherWithoutAccess()

      const accessChecker = buildAccessChecker({
        fetcher,
        collectionsL1SubgraphUrl: collectionsL1Url,
        blocksL1SubgraphUrl: blocksL1Url
      })

      await checkAccess(accessChecker, {
        pointers: ['urn:decentraland:ethereum:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1']
      })

      verify(mockedFetcher.queryGraph(blocksL1Url, anything(), anything())).once()
      verify(mockedFetcher.queryGraph(collectionsL1Url, anything(), anything())).twice()
    })
  })

  describe('Validations', () => {
    const URN_POINTER = 'urn:decentraland:ethereum:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'

    describe('When content hash is set', () => {
      const METADATA = { some: 'value' }
      const CONTENT = new Map([['key', 'hash']])
      let hash: ContentFileHash

      beforeEach(async () => {
        const entries = Array.from(CONTENT.entries())
        const contentAsJson =
          entries.map(([key, hash]) => ({ key, hash })).sort((a, b) => (a.hash > b.hash ? 1 : -1)) ?? []
        const buffer = Buffer.from(JSON.stringify({ content: contentAsJson, metadata: METADATA }))
        hash = await Hashing.calculateIPFSHash(buffer)
      })

      it(`and deployment hash matches and deployer is committee member, then deployment is valid`, async () => {
        const { fetcher } = fetcherWithInvalidCollectionAndContentHash(hash)
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, {
          pointers: [URN_POINTER],
          ethAddress: COMMITTEE_MEMBER,
          content: CONTENT,
          metadata: METADATA
        })

        expect(errors.length).toBe(0)
      })

      it(`and deployment hash matches but deployer is not owner, then deployment is invalid`, async () => {
        const ethAddress = 'someAddress'
        const { fetcher } = fetcherWithValidCollectionAndCreatorAndContentHash(ethAddress, hash)
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, {
          pointers: [URN_POINTER],
          ethAddress,
          content: CONTENT,
          metadata: METADATA
        })

        expect(errors).toEqual([
          `The provided Eth Address '${ethAddress}' does not have access to the following wearable: '${URN_POINTER}'`
        ])
      })

      it(`and deployer is committee member but deployment hash doesn't match, then deployment is invalid`, async () => {
        const ethAddress = 'someAddress'
        const { fetcher } = fetcherWithValidCollectionAndCreatorAndContentHash(ethAddress, 'some-content-hash')
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, {
          pointers: [URN_POINTER],
          ethAddress: COMMITTEE_MEMBER,
          content: CONTENT,
          metadata: METADATA
        })

        expect(errors).toEqual([
          `The provided Eth Address '${COMMITTEE_MEMBER}' does not have access to the following wearable: '${URN_POINTER}'`
        ])
      })
    })

    describe(`When content hash isn't set`, () => {
      describe('and the collection is valid', () => {
        it(`and deployer is the collection's creator, then deployment is valid`, async () => {
          const ethAddress = 'someAddress'
          const { fetcher } = fetcherWithValidCollectionAndCreator(ethAddress)
          const accessChecker = buildAccessChecker({ fetcher })

          const errors = await checkAccess(accessChecker, { pointers: [URN_POINTER], ethAddress })

          expect(errors.length).toBe(0)
        })

        it(`and deployer is one of the collection's managers, then deployment is valid`, async () => {
          const ethAddress = 'someAddress'
          const { fetcher } = fetcherWithValidCollectionAndCollectionManager(ethAddress)
          const accessChecker = buildAccessChecker({ fetcher })

          const errors = await checkAccess(accessChecker, { pointers: [URN_POINTER], ethAddress })

          expect(errors.length).toBe(0)
        })

        it(`and deployer is one of the item's managers, then deployment is valid`, async () => {
          const ethAddress = 'someAddress'
          const { fetcher } = fetcherWithValidCollectionAndItemManager(ethAddress)
          const accessChecker = buildAccessChecker({ fetcher })

          const errors = await checkAccess(accessChecker, { pointers: [URN_POINTER], ethAddress })

          expect(errors.length).toBe(0)
        })
      })

      describe('and the collection is invalid', () => {
        it(`and deployer is the collection's creator, then deployment is invalid`, async () => {
          const ethAddress = 'someAddress'
          const { fetcher } = fetcherWithInvalidCollectionAndCreator(ethAddress)
          const accessChecker = buildAccessChecker({ fetcher })

          const errors = await checkAccess(accessChecker, { pointers: [URN_POINTER], ethAddress })

          expect(errors).toEqual([
            `The provided Eth Address '${ethAddress}' does not have access to the following wearable: '${URN_POINTER}'`
          ])
        })

        it(`and deployer is one of the collection's managers, then deployment is invalid`, async () => {
          const ethAddress = 'someAddress'
          const { fetcher } = fetcherWithInvalidCollectionAndCollectionManager(ethAddress)
          const accessChecker = buildAccessChecker({ fetcher })

          const errors = await checkAccess(accessChecker, { pointers: [URN_POINTER], ethAddress })

          expect(errors).toEqual([
            `The provided Eth Address '${ethAddress}' does not have access to the following wearable: '${URN_POINTER}'`
          ])
        })

        it(`and deployer is one of the item's managers, then deployment is invalid`, async () => {
          const ethAddress = 'someAddress'
          const { fetcher } = fetcherWithInvalidCollectionAndItemManager(ethAddress)
          const accessChecker = buildAccessChecker({ fetcher })

          const errors = await checkAccess(accessChecker, { pointers: [URN_POINTER], ethAddress })

          expect(errors).toEqual([
            `The provided Eth Address '${ethAddress}' does not have access to the following wearable: '${URN_POINTER}'`
          ])
        })
      })
    })
  })

  function buildAccessChecker(params?: Partial<AccessCheckerImplParams>) {
    const { fetcher, collectionsL1SubgraphUrl, collectionsL2SubgraphUrl, blocksL1SubgraphUrl, blocksL2SubgraphUrl } = {
      fetcher: new Fetcher(),
      collectionsL1SubgraphUrl: 'Unused URL',
      collectionsL2SubgraphUrl: 'Unused URL',
      blocksL1SubgraphUrl: 'Unused block URL',
      blocksL2SubgraphUrl: 'Unused block URL',
      ...params
    }
    return new AccessCheckerForWearables(
      fetcher,
      collectionsL1SubgraphUrl,
      collectionsL2SubgraphUrl,
      blocksL1SubgraphUrl,
      blocksL2SubgraphUrl,
      mock(Logger)
    )
  }

  function checkAccess(
    accessChecker: AccessCheckerForWearables,
    options: {
      metadata?: any
      content?: Map<string, ContentFileHash>
      pointers?: Pointer[]
      timestamp?: Timestamp
      ethAddress?: EthAddress
    }
  ) {
    const withDefaults = {
      version: EntityVersion.V3,
      metadata: {},
      content: new Map(),
      pointers: ['invalid pointer'],
      timestamp: Date.now(),
      ethAddress: 'some address',
      ...options
    }
    return accessChecker.checkAccess(withDefaults)
  }

  function mockFetcher(collection?: Partial<WearableCollection>, accounts?: string[]) {
    const withDefaults = {
      collections: [
        {
          creator: '',
          managers: [],
          isApproved: false,
          isCompleted: false,
          items: [
            {
              managers: [],
              contentHash: ''
            }
          ],
          ...collection
        }
      ],
      accounts: [{ id: COMMITTEE_MEMBER }]
    }

    const mockedFetcher = mock(Fetcher)
    when(mockedFetcher.queryGraph(anything(), anything(), anything())).thenCall((url) => {
      if (url.includes('block')) {
        return Promise.resolve({ after: [{ number: 10 }], fiveMinAfter: [{ number: 5 }] })
      } else {
        return Promise.resolve(withDefaults)
      }
    })

    const fetcher = instance(mockedFetcher)
    return { fetcher, mockedFetcher }
  }

  function fetcherWithoutAccess() {
    return mockFetcher()
  }

  function fetcherWithValidCollectionAndCreator(address: string) {
    return mockFetcher({ creator: address.toLowerCase(), isCompleted: true, isApproved: false })
  }

  function fetcherWithValidCollectionAndCollectionManager(address: string) {
    return mockFetcher({ managers: [address.toLowerCase()], isCompleted: true, isApproved: false })
  }

  function fetcherWithValidCollectionAndItemManager(address: string) {
    return mockFetcher({
      items: [{ managers: [address.toLowerCase()], contentHash: '' }],
      isCompleted: true,
      isApproved: false
    })
  }

  function fetcherWithValidCollectionAndCreatorAndContentHash(address: string, contentHash: string) {
    return mockFetcher({
      creator: address.toLowerCase(),
      isCompleted: true,
      isApproved: false,
      items: [{ managers: [], contentHash }]
    })
  }

  function fetcherWithInvalidCollectionAndCreator(address: string) {
    return mockFetcher({ creator: address.toLowerCase(), isCompleted: true, isApproved: true })
  }

  function fetcherWithInvalidCollectionAndCollectionManager(address: string) {
    return mockFetcher({ managers: [address.toLowerCase()], isCompleted: true, isApproved: true })
  }

  function fetcherWithInvalidCollectionAndItemManager(address: string) {
    return mockFetcher({
      items: [{ managers: [address.toLowerCase()], contentHash: '' }],
      isCompleted: true,
      isApproved: true
    })
  }

  function fetcherWithInvalidCollectionAndContentHash(contentHash: string) {
    return mockFetcher({
      items: [{ managers: [], contentHash }],
      isCompleted: true,
      isApproved: true
    })
  }
})
