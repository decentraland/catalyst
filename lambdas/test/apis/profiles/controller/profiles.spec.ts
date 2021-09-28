import { Entity, EntityType, EntityVersion } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { anything, instance, mock, when } from 'ts-mockito'
import { WearableId } from '../../../../src/apis/collections/types'
import {
  fetchProfiles,
  fetchProfilesForSnapshots,
  ProfileMetadata
} from '../../../../src/apis/profiles/controllers/profiles'
import { EnsOwnership } from '../../../../src/apis/profiles/EnsOwnership'
import { NFTOwnership } from '../../../../src/apis/profiles/NFTOwnership'
import { WearablesOwnership } from '../../../../src/apis/profiles/WearablesOwnership'
import { SmartContentClient } from '../../../../src/utils/SmartContentClient'

const EXTERNAL_URL = 'https://content-url.com'

describe('profiles', () => {
  const SOME_ADDRESS = '0x079bed9c31cb772c4c156f86e1cff15bf751add0'
  const SOME_NAME = 'NFTName'
  const WEARABLE_ID_1 = 'someCollection-someWearable'

  it(`When profiles are fetched and NFTs are owned, then the returned profile is the same as the content server`, async () => {
    const { entity, metadata } = profileWith(SOME_ADDRESS, { name: SOME_NAME, wearables: [WEARABLE_ID_1] })
    const client = contentServerThatReturns(entity)
    const ensOwnership = ownedNFTs(EnsOwnership, SOME_ADDRESS, SOME_NAME)
    const wearablesOwnership = ownedNFTs(WearablesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

    const profiles = (await fetchProfiles([SOME_ADDRESS], client, ensOwnership, wearablesOwnership))!

    expect(profiles.length).toEqual(1)
    expect(profiles[0]).toEqual(metadata)
  })

  it(`When the current name is not owned, then it says so in the profile`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { name: SOME_NAME })
    const client = contentServerThatReturns(entity)
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)

    const profiles = (await fetchProfiles([SOME_ADDRESS], client, ensOwnership, wearablesOwnership))!

    expect(profiles.length).toEqual(1)
    expect(profiles[0].avatars[0].name).toEqual(SOME_NAME)
    expect(profiles[0].avatars[0].hasClaimedName).toEqual(false)
  })

  it(`When some of the worn wearables are not owned, then they are filtered out`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { wearables: [WEARABLE_ID_1] })
    const client = contentServerThatReturns(entity)
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)

    const profiles = (await fetchProfiles([SOME_ADDRESS], client, ensOwnership, wearablesOwnership))!

    expect(profiles.length).toEqual(1)
    expect(profiles[0].avatars[0].avatar.wearables.length).toEqual(0)
  })

  it(`When some of the worn wearables are not owned but sanitization is off, then they are not filtered out`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { wearables: [WEARABLE_ID_1] })
    const client = contentServerThatReturns(entity)
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)

    const profiles = (await fetchProfiles([SOME_ADDRESS], client, ensOwnership, wearablesOwnership, undefined, false))!

    expect(profiles.length).toEqual(1)
    expect(profiles[0].avatars[0].avatar.wearables).toEqual([WEARABLE_ID_1])
  })

  it(`When the is no profile with that address, then an empty list is returned`, async () => {
    const client = contentServerThatReturns()
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)

    const profiles = (await fetchProfiles([SOME_ADDRESS], client, ensOwnership, wearablesOwnership))!

    expect(profiles.length).toEqual(0)
  })

  it(`When profiles are returned, external urls are added to snapshots`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { snapshots: { aKey: 'aHash' } })
    const client = contentServerThatReturns(entity)
    const ensOwnership = noNFTs(EnsOwnership)
    const wearablesOwnership = noNFTs(WearablesOwnership)

    const profiles = (await fetchProfiles([SOME_ADDRESS], client, ensOwnership, wearablesOwnership))!

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

    const profiles = (await fetchProfiles([SOME_ADDRESS], client, ensOwnership, wearablesOwnership))!

    expect(profiles.length).toEqual(1)
    expect(profiles[0].avatars[0].avatar.snapshots.aKey).toEqual(`${EXTERNAL_URL}/contents/fileHash`)
  })

  it(`When profiles are returned but only the snapshots, external urls are added to snapshots`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { snapshots: { aKey: 'aHash' } })
    const client = contentServerThatReturns(entity)

    const profiles = await fetchProfilesForSnapshots([SOME_ADDRESS], client)

    expect(profiles.length).toEqual(1)
    expect(profiles[0].ethAddress).toEqual(SOME_ADDRESS)
    expect(profiles[0].avatars[0].avatar.snapshots.aKey).toEqual(`${EXTERNAL_URL}/contents/aHash`)
  })

  it(`When profiles are returned but only the snapshots, external urls pointing to the hash are added to snapshots`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, {
      snapshots: { aKey: './file' },
      content: { file: './file', hash: 'fileHash' }
    })
    const client = contentServerThatReturns(entity)

    const profiles = await fetchProfilesForSnapshots([SOME_ADDRESS], client)

    expect(profiles.length).toEqual(1)
    expect(profiles[0].ethAddress).toEqual(SOME_ADDRESS)
    expect(profiles[0].avatars[0].avatar.snapshots.aKey).toEqual(`${EXTERNAL_URL}/contents/fileHash`)
  })

  it(`When an ifModifiedSince timestamp is provided and it is after the profile's last update, fetchProfiles returns undefined`, async () => {
    const { entity } = profileWith(SOME_ADDRESS, { name: SOME_NAME, wearables: [WEARABLE_ID_1] })
    const client = contentServerThatReturns(entity)
    const ensOwnership = ownedNFTs(EnsOwnership, SOME_ADDRESS, SOME_NAME)
    const wearablesOwnership = ownedNFTs(WearablesOwnership, SOME_ADDRESS, WEARABLE_ID_1)

    expect(await fetchProfiles([SOME_ADDRESS], client, ensOwnership, wearablesOwnership, 2000)).toBe(undefined)
    expect(await fetchProfiles([SOME_ADDRESS], client, ensOwnership, wearablesOwnership, 3000)).toBe(undefined)
  })
})

function profileWith(
  ethAddress: EthAddress,
  options: {
    name?: string
    wearables?: string[]
    snapshots?: Record<string, string>
    content?: { file: string; hash: string }
  }
): { entity: Entity; metadata: ProfileMetadata } {
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
          wearables: options.wearables ?? []
        }
      }
    ]
  }

  const entity = {
    id: '',
    version: EntityVersion.V3,
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
  when(mockedClient.fetchEntitiesByPointers(anything(), anything())).thenResolve(profile ? [profile] : [])
  when(mockedClient.getExternalContentServerUrl()).thenReturn(EXTERNAL_URL)
  return instance(mockedClient)
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
