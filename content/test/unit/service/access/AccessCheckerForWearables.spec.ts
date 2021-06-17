import {
  AccessCheckerForWearables,
  WearableCollection
} from '@katalyst/content/service/access/AccessCheckerForWearables'
import { AccessCheckerImplParams } from '@katalyst/content/service/access/AccessCheckerImpl'
import { EntityId, Fetcher, Pointer, Timestamp } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Logger } from 'log4js'
import { anything, instance, mock, verify, when } from 'ts-mockito'

describe('AccessCheckerForScenes', function () {
  it(`When non-urns are used as pointers, then validation fails`, async () => {
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers: ['invalid_pointer'] })

    expect(errors).toEqual([
      'Wearable pointers should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (invalid_pointer)'
    ])
  })

  it(`When there is more than one pointer set, then validation fails`, async () => {
    const pointers = ['pointer1', 'pointer2']
    const accessChecker = buildAccessChecker()

    const errors = await checkAccess(accessChecker, { pointers })

    expect(errors).toEqual([`Only one pointer is allowed when you create a Wearable. Received: ${pointers}`])
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
    const VALID_POINTER = 'urn:decentraland:ethereum:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'

    describe('When the collection is valid', () => {
      it(`and deployer is the collection's creator, then deployment is valid`, async () => {
        const ethAddress = 'someAddress'
        const { fetcher } = fetcherWithValidCollectionAndCreator(ethAddress)
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, { pointers: [VALID_POINTER], ethAddress })

        expect(errors.length).toBe(0)
      })

      it(`and deployer is one of the collection's managers, then deployment is valid`, async () => {
        const ethAddress = 'someAddress'
        const { fetcher } = fetcherWithValidCollectionAndCollectionManager(ethAddress)
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, { pointers: [VALID_POINTER], ethAddress })

        expect(errors.length).toBe(0)
      })

      it(`and deployer is one of the item's managers, then deployment is valid`, async () => {
        const ethAddress = 'someAddress'
        const { fetcher } = fetcherWithValidCollectionAndItemManager(ethAddress)
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, { pointers: [VALID_POINTER], ethAddress })

        expect(errors.length).toBe(0)
      })
    })

    describe('When the collection is invalid', () => {
      it(`and deployer is the collection's creator, then deployment is invalid`, async () => {
        const ethAddress = 'someAddress'
        const { fetcher } = fetcherWithInvalidCollectionAndCreator(ethAddress)
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, { pointers: [VALID_POINTER], ethAddress })

        expect(errors).toEqual([
          `The provided Eth Address does not have access to the following wearable: (${VALID_POINTER})`
        ])
      })

      it(`and deployer is one of the collection's managers, then deployment is invalid`, async () => {
        const ethAddress = 'someAddress'
        const { fetcher } = fetcherWithInvalidCollectionAndCollectionManager(ethAddress)
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, { pointers: [VALID_POINTER], ethAddress })

        expect(errors).toEqual([
          `The provided Eth Address does not have access to the following wearable: (${VALID_POINTER})`
        ])
      })

      it(`and deployer is one of the item's managers, then deployment is invalid`, async () => {
        const ethAddress = 'someAddress'
        const { fetcher } = fetcherWithInvalidCollectionAndItemManager(ethAddress)
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, { pointers: [VALID_POINTER], ethAddress })

        expect(errors).toEqual([
          `The provided Eth Address does not have access to the following wearable: (${VALID_POINTER})`
        ])
      })

      it(`but the content hash matches the entity's id, then deployment is valid`, async () => {
        const entityId = 'entityId'
        const { fetcher } = fetcherWithInvalidCollectionAndContentHash(entityId)
        const accessChecker = buildAccessChecker({ fetcher })

        const errors = await checkAccess(accessChecker, { pointers: [VALID_POINTER], entityId })

        expect(errors.length).toBe(0)
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
      entityId?: EntityId
      pointers?: Pointer[]
      timestamp?: Timestamp
      ethAddress?: EthAddress
    }
  ) {
    const withDefaults = {
      entityId: 'someId',
      pointers: ['invalid pointer'],
      timestamp: Date.now(),
      ethAddress: 'some address',
      ...options
    }
    return accessChecker.checkAccess(withDefaults)
  }

  function mockFetcher(collection?: Partial<WearableCollection>) {
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
      ]
    }

    const mockedFetcher = mock(Fetcher)
    when(mockedFetcher.queryGraph(anything(), anything(), anything())).thenCall((url) => {
      if (url.includes('block')) {
        return Promise.resolve({ after: [{ number: 10 }], fiveMin: [{ number: 5 }] })
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
