import { ContentFileHash, Entity, EntityType } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Request, Response } from 'express'
import log4js from 'log4js'
import { asArray } from '../../../utils/ControllerUtils'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { WearableId } from '../../collections/types'
import { isBaseAvatar, translateWearablesIdFormat } from '../../collections/Utils'
import { EnsOwnership } from '../EnsOwnership'
import { WearablesOwnership } from '../WearablesOwnership'

const LOGGER = log4js.getLogger('profiles')

function setCacheHeaders(res: Response, profiles: ProfileMetadata[], cacheTTL: number) {
  if (profiles.length === 0) return

  let maxTimestamp = profiles[0]?.timestamp
  for (let i = 1; i < profiles.length; i++) {
    maxTimestamp = Math.max(maxTimestamp, profiles[i].timestamp)
  }

  if (maxTimestamp) {
    // These headers are HTTP standard. See the links below for more information about how they are used
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Last-Modified
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
    res.header('Last-Modified', new Date(maxTimestamp).toUTCString())
    res.header('Cache-Control', `public, max-age=${cacheTTL},s-maxage=${cacheTTL}`)
  }
}

function getIfModifiedSinceTimestamp(req: Request): number | undefined {
  // This is a standard HTTP header. See the link below for more information
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Modified-Since
  const headerValue = req.header('If-Modified-Since')
  if (!headerValue) return
  try {
    const timestamp = Date.parse(headerValue)
    return isNaN(timestamp) ? undefined : timestamp
  } catch (e) {
    LOGGER.warn('Received an invalid header for If-Modified-Since ', headerValue)
  }
}

function sendProfilesResponse(
  res: Response,
  profiles: ProfileMetadata[] | undefined,
  cacheTTL: number,
  singleProfile: boolean = false
) {
  if (profiles) {
    setCacheHeaders(res, profiles, cacheTTL)
    if (singleProfile) {
      const returnProfile: ProfileMetadata = profiles[0] ?? { avatars: [], timestamp: 0 }
      res.send(returnProfile)
    } else {
      res.send(profiles)
    }
  } else {
    // The only case in which we receive undefined profiles is when no profile was updated after de If-Modified-Since specified moment.
    // In this case, as per spec, we return 304 (not modified) and empty body
    // See here: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Modified-Since
    res.status(304).send()
  }
}

export async function getIndividualProfileById(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearables: WearablesOwnership,
  profilesCacheTTL: number,
  req: Request,
  res: Response
): Promise<void> {
  // Method: GET
  // Path: /:id
  const profileId: string = req.params.id
  const profiles = await fetchProfiles(
    [profileId],
    client,
    ensOwnership,
    wearables,
    getIfModifiedSinceTimestamp(req),
    false
  )
  sendProfilesResponse(res, profiles, profilesCacheTTL, true)
}

export async function getProfilesById(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearables: WearablesOwnership,
  profilesCacheTTL: number,
  req: Request,
  res: Response
) {
  const profileIds: EthAddress[] | undefined = asArray(req.query.id as string)
  const fields: string[] | undefined = asArray(req.query.field as string)
  if (!profileIds) {
    return res.status(400).send({ error: 'You must specify at least one profile id' })
  }

  if (fields && fields.includes('snapshots')) {
    const profiles = await fetchProfilesForSnapshots(profileIds, client)
    res.send(profiles)
  } else {
    const profiles = await fetchProfiles(profileIds, client, ensOwnership, wearables, getIfModifiedSinceTimestamp(req))
    sendProfilesResponse(res, profiles, profilesCacheTTL)
  }
}

// Dates received from If-Modified-Since headers have precisions of seconds, so we need to round
function roundToSeconds(timestamp: number) {
  return Math.floor(timestamp / 1000) * 1000
}

// Visible for testing purposes
export async function fetchProfiles(
  ethAddresses: EthAddress[],
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  ifModifiedSinceTimestamp?: number | undefined,
  performWearableSanitization: boolean = true
): Promise<ProfileMetadata[] | undefined> {
  try {
    const entities: Entity[] = await client.fetchEntitiesByPointers(EntityType.PROFILE, ethAddresses)

    if (ifModifiedSinceTimestamp && entities.every((it) => roundToSeconds(it.timestamp) <= ifModifiedSinceTimestamp))
      return

    const profiles: Map<EthAddress, { metadata: ProfileMetadata; content: Map<string, ContentFileHash> }> = new Map()
    const names: Map<EthAddress, string[]> = new Map()
    const wearables: Map<EthAddress, WearableId[]> = new Map()

    // Group nfts and profile metadata by ethAddress
    const entityPromises = entities
      .filter((entity) => !!entity.metadata)
      .map(async (entity) => {
        const ethAddress = entity.pointers[0]
        const metadata: ProfileMetadata = entity.metadata
        metadata.timestamp = entity.timestamp
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
    const ownedWearablesPromise = performWearableSanitization
      ? wearablesOwnership.areNFTsOwned(wearables)
      : Promise.resolve(new Map())
    const ownedENSPromise = ensOwnership.areNFTsOwned(names)
    const [ownedWearables, ownedENS] = await Promise.all([ownedWearablesPromise, ownedENSPromise])

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
          bodyShape: performWearableSanitization
            ? await translateWearablesIdFormat(profileData.avatar.bodyShape)
            : profileData.avatar.bodyShape,
          snapshots: addBaseUrlToSnapshots(client.getExternalContentServerUrl(), profileData.avatar, content),
          wearables: performWearableSanitization
            ? await sanitizeWearables(fixWearableId(profileData.avatar.wearables), wearablesOwnership)
            : fixWearableId(profileData.avatar.wearables)
        }
      }))
      return { timestamp: profile.metadata.timestamp, avatars: await Promise.all(avatars) }
    })
    return await Promise.all(result)
  } catch (error) {
    LOGGER.warn(error)
    return []
  }
}

// Visible for testing purposes
export async function fetchProfilesForSnapshots(
  ethAddresses: EthAddress[],
  client: SmartContentClient
): Promise<ProfileMetadataForSnapshots[]> {
  try {
    const entities: Entity[] = await client.fetchEntitiesByPointers(EntityType.PROFILE, ethAddresses)

    const profilesMetadataForSnapshots: ProfileMetadataForSnapshots[] = entities
      .filter((entity) => !!entity.metadata)
      .map((entity) => {
        const ethAddress: EthAddress = entity.pointers[0]
        const metadata: ProfileMetadata = entity.metadata
        const avatar: Avatar = metadata.avatars[0].avatar
        const content = new Map((entity.content ?? []).map(({ file, hash }) => [file, hash]))
        const profileMetadataForSnapshots: ProfileMetadataForSnapshots = {
          ethAddress,
          avatars: [
            {
              avatar: {
                snapshots: addBaseUrlToSnapshots(client.getExternalContentServerUrl(), avatar, content)
              }
            }
          ]
        }
        return profileMetadataForSnapshots
      })
    return profilesMetadataForSnapshots
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
  timestamp: number
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

export type ProfileMetadataForSnapshots = {
  ethAddress: EthAddress
  avatars: {
    avatar: AvatarForSnapshots
  }[]
}
type AvatarForSnapshots = {
  snapshots: AvatarSnapshots
}
