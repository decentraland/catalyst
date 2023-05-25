import { EthAddress } from '@dcl/crypto'
import { Entity, Profile, WearableId } from '@dcl/schemas'
import { NextFunction, Request, RequestHandler, Response } from 'express'
import log4js from 'log4js'
import { TheGraphClient } from '../../../ports/the-graph/types'
import { ThirdPartyAssetFetcher } from '../../../ports/third-party/third-party-fetcher'
import { asArray } from '../../../utils/ControllerUtils'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { isBaseAvatar, isOldEmote, translateWearablesIdFormat } from '../../collections/Utils'
import { EmotesOwnership } from '../EmotesOwnership'
import { EnsOwnership } from '../EnsOwnership'
import { WearablesOwnership } from '../WearablesOwnership'
import { emotesSavedAsWearables } from '../old-emotes'
import { checkForThirdPartyEmotesOwnership, checkForThirdPartyWearablesOwnership } from '../tp-wearables-ownership'

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
  emotes: EmotesOwnership,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
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
    emotes,
    thirdPartyFetcher,
    getIfModifiedSinceTimestamp(req)
  )
  sendProfilesResponse(res, profiles, profilesCacheTTL, true)
}

export async function getProfilesByIdPost(
  theGraphClient: TheGraphClient,
  contentClient: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearables: WearablesOwnership,
  emotes: EmotesOwnership,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  profilesCacheTTL: number,
  req: Request,
  res: Response
): Promise<Response<any, Record<string, any>> | undefined> {
  // Method: POST
  // Path: /lambdas/profiles
  // Body: { ids: string[] }

  const profileIds: string[] = req.body?.ids ?? []

  if (profileIds.length === 0) {
    return res.status(400).send({ error: 'You must specify at least one profile id' })
  }

  const profiles = await fetchProfiles(
    profileIds,
    theGraphClient,
    contentClient,
    ensOwnership,
    wearables,
    emotes,
    thirdPartyFetcher,
    getIfModifiedSinceTimestamp(req)
  )
  sendProfilesResponse(res, profiles, profilesCacheTTL)
}

export async function getProfilesById(
  theGraphClient: TheGraphClient,
  contentClient: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearables: WearablesOwnership,
  emotes: EmotesOwnership,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  profilesCacheTTL: number,
  req: Request,
  res: Response
): Promise<Response<any, Record<string, any>> | undefined> {
  // Method: GET
  // Path: /lambdas/profiles?id={ids}
  const profileIds: EthAddress[] = asArray(req.query.id as string)

  if (profileIds.length === 0) {
    return res.status(400).send({ error: 'You must specify at least one profile id' })
  }

  const profiles = await fetchProfiles(
    profileIds,
    theGraphClient,
    contentClient,
    ensOwnership,
    wearables,
    emotes,
    thirdPartyFetcher,
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
  emotesOwnership: EmotesOwnership,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  ifModifiedSinceTimestamp?: number | undefined
): Promise<ProfileMetadata[] | undefined> {
  try {
    const profilesEntities: Entity[] = await contentClient.fetchEntitiesByPointers(ethAddresses)

    // Avoid querying profiles if there wasn't any new deployment
    if (
      ifModifiedSinceTimestamp &&
      profilesEntities.every((it) => roundToSeconds(it.timestamp) <= ifModifiedSinceTimestamp)
    )
      return

    const profilesMap: Map<EthAddress, { metadata: ProfileMetadata; content: Map<string, string> }> = new Map()
    const namesMap: Map<EthAddress, string[]> = new Map()
    const wearablesMap: Map<EthAddress, WearableId[]> = new Map()
    const emotesMap: Map<EthAddress, { slot: number; urn: string }[]> = new Map()

    // Group nfts and profile metadata by ethAddress
    const entityPromises = profilesEntities
      .filter((entity) => !!entity.metadata)
      .map(async (entity) => {
        const { ethAddress, metadata, content, names, wearables, emotes } = await extractData(entity)

        profilesMap.set(ethAddress, { metadata, content })
        namesMap.set(ethAddress, names)
        wearablesMap.set(ethAddress, wearables)
        if (emotes) {
          emotesMap.set(ethAddress, emotes)
        }
      })
    await Promise.all(entityPromises)

    //Check which NFTs are owned
    const ownedWearablesPromise = wearablesOwnership.areNFTsOwned(wearablesMap)
    const ownedENSPromise = ensOwnership.areNFTsOwned(namesMap)

    const emoteUrnsByOwner = new Map()
    for (const [owner, emotes] of emotesMap) {
      emoteUrnsByOwner.set(
        owner,
        emotes.map((emote) => emote.urn)
      )
    }
    const ownedEmotesPromise = emotesOwnership.areNFTsOwned(emoteUrnsByOwner)

    const thirdPartyWearablesPromise = checkForThirdPartyWearablesOwnership(
      theGraphClient,
      thirdPartyFetcher,
      wearablesMap
    )

    const thirdPartyEmotesPromise = checkForThirdPartyEmotesOwnership(theGraphClient, thirdPartyFetcher, emotesMap)

    const [ownedWearables, ownedENS, thirdPartyWearables, ownedEmotes, thirdPartyEmotes] = await Promise.all([
      ownedWearablesPromise,
      ownedENSPromise,
      thirdPartyWearablesPromise,
      ownedEmotesPromise,
      thirdPartyEmotesPromise
    ])

    // Add name data and snapshot urls to profiles
    const result = Array.from(profilesMap.entries()).map(async ([ethAddress, profile]) => {
      const ensOwnership = ownedENS.get(ethAddress)!
      const wearablesOwnership = ownedWearables.get(ethAddress)!
      const emotesOwnership = ownedEmotes.get(ethAddress)!
      const tpe = thirdPartyEmotes.get(ethAddress) ?? []

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
          ),
          emotes: (emotesMap.get(ethAddress) ?? ([] as { slot: number; urn: string }[]))
            .filter((emote) => isOldEmote(emote.urn) || emotesOwnership.get(emote.urn))
            .concat(tpe)
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
  content: Map<string, string>
  names: string[]
  wearables: WearableId[]
  emotes?: {
    slot: number
    urn: string
  }[]
}> {
  const ethAddress = entity.pointers[0]
  const metadata: ProfileMetadata = entity.metadata
  const content = new Map((entity.content ?? []).map(({ file, hash }) => [file, hash]))
  const filteredNames = metadata.avatars.map(({ name }) => name).filter((name) => name && name.trim().length > 0)
  // Add timestamp to the metadata
  metadata.timestamp = entity.timestamp
  // Validate wearables urn
  const filteredWearables = await validateWearablesUrn(metadata)
  let slot = 0
  const emotesSavedAsWearablesInProfile = filteredWearables
    .filter((wearable) => emotesSavedAsWearables.includes(wearable))
    .map((emoteAsWearable) => {
      const emote = { slot, urn: emoteAsWearable }
      slot = slot + 1
      return emote
    })

  const emotes = [...getEmotes(metadata), ...emotesSavedAsWearablesInProfile]
  const filteredEmotes = emotes.length == 0 ? undefined : emotes

  return { ethAddress, metadata, content, names: filteredNames, wearables: filteredWearables, emotes: filteredEmotes }
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

function getEmotes(metadata: ProfileMetadata): { slot: number; urn: string }[] {
  const allEmotesInProfile: { slot: number; urn: string }[] = []
  const allAvatars = metadata?.avatars ?? []
  for (const avatar of allAvatars) {
    const allEmotes: { slot: number; urn: string }[] = avatar.avatar.emotes ?? []
    for (const emote of allEmotes) {
      allEmotesInProfile.push(emote)
    }
  }
  return allEmotesInProfile
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
function addBaseUrlToSnapshots(baseUrl: string, avatar: Avatar, content: Map<string, string>): AvatarSnapshots {
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

export type LambdasProfile = Profile & {
  timestamp: number
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
  emotes?: {
    slot: number
    urn: string
  }[]
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

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch((e) => {
      console.error(`Unexpected error while performing request ${req.method} ${req.originalUrl}`, e)
      res.status(500).send({ status: 'server-error', message: 'Unexpected error' })
    })
  }
}

export function createProfileHandler(
  theGraphClient: TheGraphClient,
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  wearablesOwnership: WearablesOwnership,
  emotesOwnership: EmotesOwnership,
  thirdPartyFetcher: ThirdPartyAssetFetcher,
  profilesCacheTTL: number,
  originalHandler: (
    theGraphClient: TheGraphClient,
    client: SmartContentClient,
    ensOwnership: EnsOwnership,
    wearablesOwnership: WearablesOwnership,
    emotesOwnership: EmotesOwnership,
    thirdPartyFetcher: ThirdPartyAssetFetcher,
    profilesCacheTTL: number,
    req: Request,
    res: Response
  ) => Promise<any>
): RequestHandler {
  return asyncHandler(
    async (req, res) =>
      await originalHandler(
        theGraphClient,
        client,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher,
        profilesCacheTTL,
        req,
        res
      )
  )
}
