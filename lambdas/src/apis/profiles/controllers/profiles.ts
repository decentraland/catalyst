import { asArray } from '@katalyst/lambdas/utils/ControllerUtils'
import { ContentFileHash, Entity, EntityType } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Request, Response } from 'express'
import log4js from 'log4js'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { WearableId } from '../../collections/types'
import { isBaseAvatar, translateWearablesIdFormat } from '../../collections/Utils'
import { EnsOwnership } from '../EnsOwnership'
import { WearablesOwnership } from '../WearablesOwnership'

const LOGGER = log4js.getLogger('profiles')

export async function getIndividualProfileById(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearables: WearablesOwnership,
  req: Request,
  res: Response
): Promise<void> {
  // Method: GET
  // Path: /:id
  const profileId: string = req.params.id
  const profiles = await fetchProfiles([profileId], client, ensOwnership, wearables, false)
  const returnProfile: ProfileMetadata = profiles[0] ?? { avatars: [] }
  res.send(returnProfile)
}

export async function getProfilesById(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearables: WearablesOwnership,
  req: Request,
  res: Response
) {
  const profileIds: EthAddress[] | undefined = asArray(req.query.id)
  if (!profileIds) {
    return res.status(400).send({ error: 'You must specify at least one profile id' })
  }

  const profiles = await fetchProfiles(profileIds, client, ensOwnership, wearables)
  res.send(profiles)
}

// Visible for testing purposes
export async function fetchProfiles(
  ethAddresses: EthAddress[],
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  performWearableSanitization: boolean = true
): Promise<ProfileMetadata[]> {
  try {
    const entities: Entity[] = await client.fetchEntitiesByPointers(EntityType.PROFILE, ethAddresses)
    const profiles: Map<EthAddress, { metadata: ProfileMetadata; content: Map<string, ContentFileHash> }> = new Map()
    const names: Map<EthAddress, string[]> = new Map()
    const wearables: Map<EthAddress, WearableId[]> = new Map()

    // Group nfts and profile metadata by ethAddress
    const entityPromises = entities
      .filter((entity) => !!entity.metadata)
      .map(async (entity) => {
        const ethAddress = entity.pointers[0]
        const metadata: ProfileMetadata = entity.metadata
        const content = new Map((entity.content ?? []).map(({ file, hash }) => [file, hash]))
        profiles.set(ethAddress, { metadata, content })
        const filteredNames = metadata.avatars.map(({ name }) => name).filter((name) => name && name.trim().length > 0)
        names.set(ethAddress, filteredNames)
        const allWearablesInProfilePromises: Promise<WearableId | undefined>[] = []
        metadata.avatars.forEach(({ avatar }) =>
          avatar.wearables
            .filter((wearableId) => !isBaseAvatar(wearableId))
            .map(translateWearablesIdFormat)
            .forEach((wearableId) => allWearablesInProfilePromises.push(wearableId))
        )
        const filtered = (await Promise.all(allWearablesInProfilePromises)).filter(
          (wearableId): wearableId is WearableId => !!wearableId
        )
        wearables.set(ethAddress, filtered)
      })
    await Promise.all(entityPromises)

    // Check which NFTs are owned
    const ownedWearables = performWearableSanitization ? await wearablesOwnership.areNFTsOwned(wearables) : new Map()
    const ownedENS = await ensOwnership.areNFTsOwned(names)

    // Add name data and snapshot urls to profiles
    const result = Array.from(profiles.entries()).map(async ([ethAddress, profile]) => {
      const ensOwnership = ownedENS.get(ethAddress)!
      const wearablesOwnership = ownedWearables.get(ethAddress)!
      const { metadata, content } = profile
      const avatars = metadata.avatars.map(async (profileData) => ({
        ...profileData,
        hasClaimedName: ensOwnership.get(profileData.name) ?? false,
        avatar: {
          ...profileData.avatar,
          snapshots: addBaseUrlToSnapshots(client.getExternalContentServerUrl(), profileData.avatar, content),
          wearables: performWearableSanitization
            ? await sanitizeWearables(fixWearableId(profileData.avatar.wearables), wearablesOwnership)
            : fixWearableId(profileData.avatar.wearables)
        }
      }))
      return { avatars: await Promise.all(avatars) }
    })
    return await Promise.all(result)
  } catch (error) {
    console.log(error)
    LOGGER.warn(error)
    return []
  }
}

/**
 * During the wearables migration into the content server, we realized that a wearable had the wrong id.
 * We are now fixing all wearable ids that were stored in profiles. This will need to be here until we are sure that there are no more profiles with the wrong id
 */
function fixWearableId(wearableIds: WearableId[]): WearableId[] {
  const fixId = (wearableId: WearableId) =>
    wearableId === 'dcl://base-avatars/Moccasin' ? 'dcl://base-avatars/SchoolShoes' : wearableId
  return wearableIds.map(fixId)
}
/**
 * We are sanitizing the wearables that are being worn. This includes removing any wearables that is not currently owned, and transforming all of them into the new format
 */
async function sanitizeWearables(
  wearablesInProfile: WearableId[],
  ownership: Map<string, boolean>
): Promise<WearableId[]> {
  const translated = await Promise.all(wearablesInProfile.map(translateWearablesIdFormat))
  return translated
    .filter((wearableId): wearableId is WearableId => !!wearableId)
    .filter((wearableId: WearableId) => isBaseAvatar(wearableId) || ownership.get(wearableId))
}

/**
 * The content server provides the snapshots' hashes, but clients expect a full url. So in this
 * method, we replace the hashes by urls that would trigger the snapshot download.
 */
function addBaseUrlToSnapshots(
  baseUrl: string,
  avatar: Avatar,
  content: Map<string, ContentFileHash>
): AvatarSnapshots {
  const original = avatar.snapshots
  const snapshots: AvatarSnapshots = {}

  for (const key in original) {
    const originalValue = original[key]
    if (content.has(originalValue)) {
      // Snapshot references a content file
      const hash = content.get(originalValue)!
      snapshots[key] = baseUrl + `/contents/${hash}`
    } else {
      // Snapshot is directly a hash
      snapshots[key] = baseUrl + `/contents/${originalValue}`
    }
  }

  return snapshots
}

export type ProfileMetadata = {
  avatars: {
    name: string
    description: string
    hasClaimedName?: boolean
    avatar: Avatar
  }[]
}

type AvatarSnapshots = Record<string, string>

type Avatar = {
  bodyShape: any
  eyes: any
  hair: any
  skin: any
  snapshots: AvatarSnapshots
  version: number
  wearables: WearableId[]
}
