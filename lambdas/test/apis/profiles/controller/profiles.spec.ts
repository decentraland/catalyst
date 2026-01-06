import { EthAddress } from '@dcl/crypto'
import { Entity, EntityType, WearableId } from '@dcl/schemas'
import { EmotesOwnership } from '../../../../src/apis/profiles/EmotesOwnership'
import { EnsOwnership } from '../../../../src/apis/profiles/EnsOwnership'
import { NFTOwnership } from '../../../../src/apis/profiles/NFTOwnership'
import { WearablesOwnership } from '../../../../src/apis/profiles/WearablesOwnership'
import * as pfs from '../../../../src/apis/profiles/controllers/profiles'
import * as tpOwnership from '../../../../src/apis/profiles/tp-wearables-ownership'
import * as tpUrnFinder from '../../../../src/logic/third-party-urn-finder'
import { TheGraphClient } from '../../../../src/ports/the-graph/types'
import { SmartContentClient } from '../../../../src/utils/SmartContentClient'

const EXTERNAL_URL = 'https://content-url.com'

describe('profiles', () => {
  const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
  const SOME_NAME = 'NFTName'
  const WEARABLE_ID_1 = 'someCollection-someWearable'
  const TPW_ID =
    'urn:decentraland:mumbai:collections-thirdparty:jean-pier:testing-deployment-6:eed7e679-4b5b-455a-a76b-7ce6c0e3bee3'

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when profiles are fetched and NFTs are owned', () => {
    let entity: Entity
    let metadata: pfs.ProfileMetadata
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      const profile = profileWith(SOME_ADDRESS, { name: SOME_NAME, wearables: [WEARABLE_ID_1], emotes: [] })
      entity = profile.entity
      metadata = profile.metadata
      client = contentServerThatReturns(entity)
      ensOwnership = ownedNFTs(SOME_ADDRESS, SOME_NAME)
      wearablesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return the same profile as the content server', async () => {
      const profiles = (await pfs.fetchProfiles(
        [SOME_ADDRESS],
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher
      ))!

      expect(profiles.length).toEqual(1)
      expect(profiles[0]).toEqual(metadata)
    })
  })

  describe('when the current name is not owned', () => {
    let entity: Entity
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      const profile = profileWith(SOME_ADDRESS, { name: SOME_NAME })
      entity = profile.entity
      client = contentServerThatReturns(entity)
      ensOwnership = noNFTs()
      wearablesOwnership = noNFTs()
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should say so in the profile', async () => {
      const profiles = (await pfs.fetchProfiles(
        [SOME_ADDRESS],
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher
      ))!

      expect(profiles.length).toEqual(1)
      expect(profiles[0].avatars[0].name).toEqual(SOME_NAME)
      expect(profiles[0].avatars[0].hasClaimedName).toEqual(false)
    })
  })

  describe('when some of the worn wearables are not owned', () => {
    let entity: Entity
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      const profile = profileWith(SOME_ADDRESS, { wearables: [WEARABLE_ID_1] })
      entity = profile.entity
      client = contentServerThatReturns(entity)
      ensOwnership = noNFTs()
      wearablesOwnership = noNFTs()
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should filter them out', async () => {
      const profiles = (await pfs.fetchProfiles(
        [SOME_ADDRESS],
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher
      ))!

      expect(profiles.length).toEqual(1)
      expect(profiles[0].avatars[0].avatar.wearables.length).toEqual(0)
    })
  })

  describe('when having TPW owned', () => {
    let entity: Entity
    let metadata: pfs.ProfileMetadata
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      const profile = profileWith(SOME_ADDRESS, { name: SOME_NAME, wearables: [TPW_ID], emotes: [] })
      entity = profile.entity
      metadata = profile.metadata
      client = contentServerThatReturns(entity)
      ensOwnership = ownedNFTs(SOME_ADDRESS, SOME_NAME)
      wearablesOwnership = noNFTs()
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
      jest.spyOn(tpOwnership, 'checkForThirdPartyWearablesOwnership').mockResolvedValue(new Map([[SOME_ADDRESS, [TPW_ID]]]))
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should show them', async () => {
      const profiles = (await pfs.fetchProfiles(
        [SOME_ADDRESS],
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher
      ))!

      expect(profiles.length).toEqual(1)
      expect(profiles[0]).toEqual(metadata)
    })
  })

  describe('when having non-urn items', () => {
    let entity: Entity
    let metadata: pfs.ProfileMetadata
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      const profile = profileWith(SOME_ADDRESS, {
        name: SOME_NAME,
        wearables: ['hammer', TPW_ID]
      })
      entity = profile.entity
      metadata = profile.metadata
      client = contentServerThatReturns(entity)
      ensOwnership = ownedNFTs(SOME_ADDRESS, SOME_NAME)
      wearablesOwnership = noNFTs()
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
      jest.spyOn(tpUrnFinder, 'findThirdPartyItemUrns').mockResolvedValue([TPW_ID])
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should remove them without logging an error', async () => {
      const profiles = (await pfs.fetchProfiles(
        [SOME_ADDRESS],
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher
      ))!

      expect(profiles.length).toEqual(1)
      metadata.avatars[0].avatar.wearables = [TPW_ID]
      expect(profiles[0]).toEqual(metadata)
    })
  })

  describe('when some of the 3TPW worn wearables are not owned', () => {
    let entity: Entity
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      const profile = profileWith(SOME_ADDRESS, { wearables: [TPW_ID] })
      entity = profile.entity
      client = contentServerThatReturns(entity)
      ensOwnership = noNFTs()
      wearablesOwnership = noNFTs()
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
      jest.spyOn(tpOwnership, 'checkForThirdPartyWearablesOwnership').mockResolvedValue(new Map())
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should filter them out', async () => {
      const profiles = (await pfs.fetchProfiles(
        [SOME_ADDRESS],
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher
      ))!

      expect(profiles.length).toEqual(1)
      expect(profiles[0].avatars[0].avatar.wearables.length).toEqual(0)
    })
  })

  describe('when there is no profile with that address', () => {
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      client = contentServerThatReturns()
      ensOwnership = noNFTs()
      wearablesOwnership = noNFTs()
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return an empty list', async () => {
      const profiles = (await pfs.fetchProfiles(
        [SOME_ADDRESS],
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher
      ))!

      expect(profiles.length).toEqual(0)
    })
  })

  describe('when profiles are returned', () => {
    let entity: Entity
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      const profile = profileWith(SOME_ADDRESS, { snapshots: { aKey: 'aHash' } })
      entity = profile.entity
      client = contentServerThatReturns(entity)
      ensOwnership = noNFTs()
      wearablesOwnership = noNFTs()
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should add external urls to snapshots', async () => {
      const profiles = (await pfs.fetchProfiles(
        [SOME_ADDRESS],
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher
      ))!

      expect(profiles.length).toEqual(1)
      expect(profiles[0].avatars[0].avatar.snapshots.aKey).toEqual(`${EXTERNAL_URL}/contents/aHash`)
    })
  })

  describe('when the snapshot references a content file', () => {
    let entity: Entity
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      const profile = profileWith(SOME_ADDRESS, {
        snapshots: { aKey: './file' },
        content: { file: './file', hash: 'fileHash' }
      })
      entity = profile.entity
      client = contentServerThatReturns(entity)
      ensOwnership = noNFTs()
      wearablesOwnership = noNFTs()
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should add external urls pointing to the hash to snapshots', async () => {
      const profiles = (await pfs.fetchProfiles(
        [SOME_ADDRESS],
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher
      ))!

      expect(profiles.length).toEqual(1)
      expect(profiles[0].avatars[0].avatar.snapshots.aKey).toEqual(`${EXTERNAL_URL}/contents/fileHash`)
    })
  })

  describe('when an ifModifiedSince timestamp is provided and it is after the profile last update', () => {
    let entity: Entity
    let client: jest.Mocked<SmartContentClient>
    let ensOwnership: jest.Mocked<EnsOwnership>
    let wearablesOwnership: jest.Mocked<WearablesOwnership>
    let emotesOwnership: jest.Mocked<EmotesOwnership>
    let theGraphClient: TheGraphClient
    let thirdPartyFetcher: { fetchAssets: () => Promise<any[]> }

    beforeEach(() => {
      const profile = profileWith(SOME_ADDRESS, { name: SOME_NAME, wearables: [WEARABLE_ID_1] })
      entity = profile.entity
      client = contentServerThatReturns(entity)
      ensOwnership = ownedNFTs(SOME_ADDRESS, SOME_NAME)
      wearablesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      emotesOwnership = ownedNFTs(SOME_ADDRESS, WEARABLE_ID_1)
      theGraphClient = theGraph()
      thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return undefined for timestamp 2000', async () => {
      expect(
        await pfs.fetchProfiles(
          [SOME_ADDRESS],
          theGraphClient,
          client,
          ensOwnership,
          wearablesOwnership,
          emotesOwnership,
          thirdPartyFetcher,
          2000
        )
      ).toBe(undefined)
    })

    it('should return undefined for timestamp 3000', async () => {
      expect(
        await pfs.fetchProfiles(
          [SOME_ADDRESS],
          theGraphClient,
          client,
          ensOwnership,
          wearablesOwnership,
          emotesOwnership,
          thirdPartyFetcher,
          3000
        )
      ).toBe(undefined)
    })
  })
})

function profileWith(
  ethAddress: EthAddress,
  options: {
    name?: string
    wearables?: string[]
    snapshots?: Record<string, string>
    content?: { file: string; hash: string }
    emotes?: { slot: number; urn: string }[]
  }
): { entity: Entity; metadata: pfs.ProfileMetadata } {
  const metadata = {
    timestamp: 2100,
    avatars: [
      {
        name: options.name ?? '',
        description: 'description',
        hasClaimedName: true,
        avatar: {
          bodyShape: 'bodyShape',
          eyes: {},
          hair: {},
          skin: {},
          version: 10,
          snapshots: options.snapshots ?? {},
          wearables: options.wearables ?? [],
          emotes: options.emotes ?? []
        }
      }
    ]
  }

  const entity = {
    id: '',
    version: 'v3',
    type: EntityType.PROFILE,
    pointers: [ethAddress],
    timestamp: 2100,
    metadata,
    content: options.content ? [options.content] : []
  }

  return { entity, metadata }
}

function contentServerThatReturns(profile?: Entity): jest.Mocked<SmartContentClient> {
  return {
    fetchEntitiesByPointers: jest.fn().mockResolvedValue(profile ? [profile] : []),
    getExternalContentServerUrl: jest.fn().mockReturnValue(EXTERNAL_URL)
  } as unknown as jest.Mocked<SmartContentClient>
}

function theGraph(): TheGraphClient {
  return {
    checkForEmotesOwnership: jest.fn(),
    checkForNamesOwnership: jest.fn(),
    checkForWearablesOwnership: jest.fn(),
    findEmoteUrnsByFilters: jest.fn(),
    findEmoteUrnsByOwner: jest.fn(),
    findThirdPartyResolver: jest.fn(),
    findWearableUrnsByFilters: jest.fn(),
    findWearableUrnsByOwner: jest.fn(),
    getAllCollections: jest.fn(),
    getThirdPartyIntegrations: jest.fn()
  }
}

function noNFTs<T extends NFTOwnership>(): jest.Mocked<T> {
  return {
    areNFTsOwned: jest.fn().mockImplementation((names: Map<EthAddress, string[]>) => {
      const entries = Array.from(names.entries()).map<[EthAddress, Map<string, boolean>]>(([address, names]) => [
        address,
        new Map(names.map((name) => [name, false]))
      ])
      return Promise.resolve(new Map(entries))
    })
  } as unknown as jest.Mocked<T>
}

function ownedNFTs<T extends NFTOwnership>(ethAddress: EthAddress, ...ownedWearables: WearableId[]): jest.Mocked<T> {
  return {
    areNFTsOwned: jest.fn().mockImplementation((names: Map<EthAddress, string[]>) => {
      const entries = Array.from(names.entries()).map<[EthAddress, Map<string, boolean>]>(([address, names]) => [
        address,
        new Map(names.map((name) => [name, address === ethAddress && ownedWearables.includes(name)]))
      ])
      return Promise.resolve(new Map(entries))
    })
  } as unknown as jest.Mocked<T>
}
