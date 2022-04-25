import { ContentFileHash, Entity, EntityType } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Request, Response } from 'express'
import log4js from 'log4js'
import { asArray } from '../../../utils/ControllerUtils'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { TheGraphClient } from '../../../utils/TheGraphClient'
import { checkForThirdPartyWearablesOwnership } from '../../../utils/third-party'
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
  theGraphClient: TheGraphClient,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearables: WearablesOwnership,
  profilesCacheTTL: number,
  req: Request,
  res: Response
): Promise<void> {
  // Method: GET
  // Path: /lambdas/profiles/:id
  const profileId: string = req.params.id
  const profiles = await fetchProfiles(
    [profileId],
    theGraphClient,
    client,
    ensOwnership,
    wearables,
    getIfModifiedSinceTimestamp(req)
  )
  sendProfilesResponse(res, profiles, profilesCacheTTL, true)
}

export async function getProfilesById(
  theGraphClient: TheGraphClient,
  contentClient: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearables: WearablesOwnership,
  profilesCacheTTL: number,
  req: Request,
  res: Response
): Promise<Response<any, Record<string, any>> | undefined> {
  // Method: GET
  // Path: /lambdas/profiles?id={ids}
  const profileIds: EthAddress[] | undefined = asArray(req.query.id as string)

  if (!profileIds) {
    return res.status(400).send({ error: 'You must specify at least one profile id' })
  }

  const profiles = await fetchProfiles(
    profileIds,
    theGraphClient,
    contentClient,
    ensOwnership,
    wearables,
    getIfModifiedSinceTimestamp(req)
  )
  sendProfilesResponse(res, profiles, profilesCacheTTL)
}

// Dates received from If-Modified-Since headers have precisions of seconds, so we need to round
function roundToSeconds(timestamp: number) {
  return Math.floor(timestamp / 1000) * 1000
}

// Visible for testing purposes
export async function fetchProfiles(
  ethAddresses: EthAddress[],
  theGraphClient: TheGraphClient,
  contentClient: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  ifModifiedSinceTimestamp?: number | undefined
): Promise<ProfileMetadata[] | undefined> {
  try {
    const profilesEntities: Entity[] = await contentClient.fetchEntitiesByPointers(EntityType.PROFILE, ethAddresses)

    // Avoid querying profiles if there wasn't any new deployment
    if (
      ifModifiedSinceTimestamp &&
      profilesEntities.every((it) => roundToSeconds(it.timestamp) <= ifModifiedSinceTimestamp)
    )
      return

    const profilesMap: Map<EthAddress, { metadata: ProfileMetadata; content: Map<string, ContentFileHash> }> = new Map()
    const namesMap: Map<EthAddress, string[]> = new Map()
    const wearablesMap: Map<EthAddress, WearableId[]> = new Map()

    // Group nfts and profile metadata by ethAddress
    const entityPromises = profilesEntities
      .filter((entity) => !!entity.metadata)
      .map(async (entity) => {
        const { ethAddress, metadata, content, names, wearables } = await extractData(entity)

        profilesMap.set(ethAddress, { metadata, content })
        namesMap.set(ethAddress, names)
        wearablesMap.set(ethAddress, wearables)
      })
    await Promise.all(entityPromises)

    //Check which NFTs are owned
    const ownedWearablesPromise = wearablesOwnership.areNFTsOwned(wearablesMap)
    const ownedENSPromise = ensOwnership.areNFTsOwned(namesMap)
    const thirdPartyWearablesPromise = checkForThirdPartyWearablesOwnership(theGraphClient, contentClient, wearablesMap)
    const [ownedWearables, ownedENS, thirdPartyWearables] = await Promise.all([
      ownedWearablesPromise,
      ownedENSPromise,
      thirdPartyWearablesPromise
    ])

    // Add name data and snapshot urls to profiles
    const result = Array.from(profilesMap.entries()).map(async ([ethAddress, profile]) => {
      const ensOwnership = ownedENS.get(ethAddress)!
      const wearablesOwnership = ownedWearables.get(ethAddress)!
      const tpw = thirdPartyWearables.get(ethAddress) ?? []
      const { metadata, content } = profile
      const avatars = metadata.avatars.map(async (profileData) => ({
        ...profileData,
        hasClaimedName: ensOwnership.get(profileData.name) ?? false,
        avatar: {
          ...profileData.avatar,
          bodyShape: await translateWearablesIdFormat(profileData.avatar.bodyShape),
          snapshots: addBaseUrlToSnapshots(contentClient.getExternalContentServerUrl(), profileData.avatar, content),
          wearables: (await sanitizeWearables(fixWearableId(profileData.avatar.wearables), wearablesOwnership)).concat(
            tpw
          )
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

async function extractData(entity: Entity): Promise<{
  ethAddress: string
  metadata: ProfileMetadata
  content: Map<string, ContentFileHash>
  names: string[]
  wearables: WearableId[]
}> {
  const ethAddress = entity.pointers[0]
  const metadata: ProfileMetadata = entity.metadata
  const content = new Map((entity.content ?? []).map(({ file, hash }) => [file, hash]))
  const filteredNames = metadata.avatars.map(({ name }) => name).filter((name) => name && name.trim().length > 0)
  // Add timestamp to the metadata
  metadata.timestamp = entity.timestamp
  // Validate wearables urn
  const filteredWearables = await validateWearablesUrn(metadata)

  return { ethAddress, metadata, content, names: filteredNames, wearables: filteredWearables }
}

async function validateWearablesUrn(metadata: ProfileMetadata) {
  const allWearablesInProfilePromises: Promise<WearableId | undefined>[] = []
  for (const avatar of metadata.avatars) {
    for (const wearableId of avatar.avatar.wearables) {
      if (!isBaseAvatar(wearableId)) {
        allWearablesInProfilePromises.push(translateWearablesIdFormat(wearableId))
      }
    }
  }
  const filteredWearables = (await Promise.all(allWearablesInProfilePromises)).filter(
    (wearableId): wearableId is WearableId => !!wearableId
  )
  return filteredWearables
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
 * We are sanitizing the wearables that are being worn. This includes removing any wearables that is not currently owned,
 * and transforming all of them into the new format
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
