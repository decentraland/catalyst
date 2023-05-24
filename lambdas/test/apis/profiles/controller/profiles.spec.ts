import { EthAddress } from '@dcl/crypto'
import { Entity, EntityType, WearableId } from '@dcl/schemas'
import { anything, instance, mock, when } from 'ts-mockito'
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
  const theGraphClient = theGraph()
  const thirdPartyFetcher = { fetchAssets: () => Promise.resolve([]) }

  it(`When profiles are fetched and NFTs are owned, then the returned profile is the same as the content server`, async () => {
    const { entity, metadata } = profileWith(SOME_ADDRESS, { name: SOME_NAME, wearables: [WEARABLE_ID_1], emotes: [] })
    const client = contentServerThatReturns(entity)
    const ensOwnership = ownedNFTs(EnsOwnership, SOME_ADDRESS, SOME_NAME)
    const wearablesOwnership = ownedNFTs(WearablesOwnership, SOME_ADDRESS, WEARABLE_ID_1)
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

  it(`When the current name is not owned, then it says so in the profile`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { name: SOME_NAME })
    const client = contentServerThatReturns(entity)
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

  it(`When some of the worn wearables are not owned, then they are filtered out`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { wearables: [WEARABLE_ID_1] })
    const client = contentServerThatReturns(entity)
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

  it(`When having TPW owned, then they are shown`, async () => {
    const { entity, metadata } = profileWith(SOME_ADDRESS, { name: SOME_NAME, wearables: [TPW_ID], emotes: [] })
    const client = contentServerThatReturns(entity)
    const ensOwnership = ownedNFTs(EnsOwnership, SOME_ADDRESS, SOME_NAME)
    const wearablesOwnership = noNFTs(WearablesOwnership)
    const tpWearablesOwnership = jest.spyOn(tpOwnership, 'checkForThirdPartyWearablesOwnership')
    tpWearablesOwnership.mockReturnValue(Promise.resolve(new Map([[SOME_ADDRESS, [TPW_ID]]])))
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

  it(`When having non-urn items, then they are removed without logging an error`, async () => {
    const { entity, metadata } = profileWith(SOME_ADDRESS, {
      name: SOME_NAME,
      wearables: ['hammer', TPW_ID]
    })
    const client = contentServerThatReturns(entity)
    const ensOwnership = ownedNFTs(EnsOwnership, SOME_ADDRESS, SOME_NAME)
    const wearablesOwnership = noNFTs(WearablesOwnership)
    const tpUrnFinderMock = jest.spyOn(tpUrnFinder, 'findThirdPartyItemUrns')
    tpUrnFinderMock.mockReturnValue(Promise.resolve([TPW_ID]))
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

  it(`When some of the 3TPW worn wearables are not owned, then they are filtered out`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { wearables: [TPW_ID] })
    const client = contentServerThatReturns(entity)
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)
    const tpWearablesOwnership = jest.spyOn(tpOwnership, 'checkForThirdPartyWearablesOwnership')
    tpWearablesOwnership.mockReturnValue(Promise.resolve(new Map()))
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

  it(`When the is no profile with that address, then an empty list is returned`, async () => {
    const client = contentServerThatReturns()
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

  it(`When profiles are returned, external urls are added to snapshots`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { snapshots: { aKey: 'aHash' } })
    const client = contentServerThatReturns(entity)
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

  it(`When the snapshot references a content file, external urls pointing to the hash are added to snapshots`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, {
      snapshots: { aKey: './file' },
      content: { file: './file', hash: 'fileHash' }
    })
    const client = contentServerThatReturns(entity)
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

  it(`When an ifModifiedSince timestamp is provided and it is after the profile's last update, pfs.fetchProfiles returns undefined`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { name: SOME_NAME, wearables: [WEARABLE_ID_1] })
    const client = contentServerThatReturns(entity)
    const ensOwnership = ownedNFTs(EnsOwnership, SOME_ADDRESS, SOME_NAME)
    const wearablesOwnership = ownedNFTs(WearablesOwnership, SOME_ADDRESS, WEARABLE_ID_1)
    const emotesOwnership = ownedNFTs(EmotesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

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

function contentServerThatReturns(profile?: Entity): SmartContentClient {
  const mockedClient = mock(SmartContentClient)
  when(mockedClient.fetchEntitiesByPointers(anything())).thenResolve(profile ? [profile] : [])
  when(mockedClient.getExternalContentServerUrl()).thenReturn(EXTERNAL_URL)
  return instance(mockedClient)
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

function noNFTs<T extends NFTOwnership>(clazz: new (...args: any[]) => T): T {
  const mockedOwnership = mock(clazz)
  when(mockedOwnership.areNFTsOwned(anything())).thenCall((names: Map<EthAddress, string[]>) => {
    const entries = Array.from(names.entries()).map<[EthAddress, Map<string, boolean>]>(([address, names]) => [
      address,
      new Map(names.map((name) => [name, false]))
    ])
    return Promise.resolve(new Map(entries))
  })
  return instance(mockedOwnership)
}

function ownedNFTs<T extends NFTOwnership>(
  clazz: new (...args: any[]) => T,
  ethAddress: EthAddress,
  ...ownedWearables: WearableId[]
): T {
  const mockedOwnership = mock(clazz)
  when(mockedOwnership.areNFTsOwned(anything())).thenCall((names: Map<EthAddress, string[]>) => {
    const entries = Array.from(names.entries()).map<[EthAddress, Map<string, boolean>]>(([address, names]) => [
      address,
      new Map(names.map((name) => [name, address === ethAddress && ownedWearables.includes(name)]))
    ])
    return Promise.resolve(new Map(entries))
  })
  return instance(mockedOwnership)
}
