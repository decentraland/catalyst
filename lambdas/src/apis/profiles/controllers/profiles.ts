import { Entity, EntityType } from 'dcl-catalyst-commons'
import { EthAddress } from 'dcl-crypto'
import { Request, Response } from 'express'
import log4js from 'log4js'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { EnsOwnership } from '../EnsOwnership'

const LOGGER = log4js.getLogger('profiles')

export async function getIndividualProfileById(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  req: Request,
  res: Response
): Promise<void> {
  // Method: GET
  // Path: /:id
  const profileId: string = req.params.id
  const profiles = await fetchProfiles([profileId], client, ensOwnership)
  const returnProfile: ProfileMetadata = profiles[0] ?? { avatars: [] }
  res.send(returnProfile)
}

export async function getProfilesById(
  client: SmartContentClient,
  ensOwnership: EnsOwnership,
  req: Request,
  res: Response
) {
  const profileIds: EthAddress[] | undefined = asArray(req.query.id)
  if (!profileIds) {
    return res.status(400).send({ error: 'You must specify at least one profile id' })
  }

  const profiles = await fetchProfiles(profileIds, client, ensOwnership)
  res.send(profiles)
}

async function fetchProfiles(
  ethAddresses: EthAddress[],
  client: SmartContentClient,
  ensOwnership: EnsOwnership
): Promise<ProfileMetadata[]> {
  try {
    const entities: Entity[] = await client.fetchEntitiesByPointers(EntityType.PROFILE, ethAddresses)
    const profiles: Map<EthAddress, ProfileMetadata> = new Map()
    const names: Map<EthAddress, string[]> = new Map()

    // Group names and profile metadata by ethAddress
    entities
      .filter((entity) => !!entity.metadata)
      .forEach((entity) => {
        const ethAddress = entity.pointers[0]
        const metadata: ProfileMetadata = entity.metadata
        profiles.set(ethAddress, metadata)
        const filteredNames = metadata.avatars.map(({ name }) => name).filter((name) => name && name.trim().length > 0)
        names.set(ethAddress, filteredNames)
      })

    // Check which names are owned
    const ownedENS = await ensOwnership.areNamesOwned(names)

    // Add name data and snapshot urls to profiles
    return Array.from(profiles.entries()).map(([ethAddress, profile]) => {
      const ensOwnership = ownedENS.get(ethAddress)!
      const avatars = profile.avatars.map((profileData) => ({
        ...profileData,
        hasClaimedName: ensOwnership.get(profileData.name) ?? false,
        avatar: {
          ...profileData.avatar,
          snapshots: addBaseUrlToSnapshots(client.getExternalContentServerUrl(), profileData.avatar)
        }
      }))
      return { avatars }
    })
  } catch (error) {
    LOGGER.warn(error)
    return []
  }
}

/**
 * The content server provides the snapshots' hashes, but clients expect a full url. So in this
 * method, we replace the hashes by urls that would trigger the snapshot download.
 */
function addBaseUrlToSnapshots(baseUrl: string, avatar: Avatar): AvatarSnapshots {
  function addBaseUrl(dst: AvatarSnapshots, src: AvatarSnapshots, key: keyof AvatarSnapshots) {
    if (src[key]) {
      dst[key] = baseUrl + `/contents/${src[key]}`
    }
  }

  const original = avatar.snapshots
  const snapshots: AvatarSnapshots = {}

  for (const key in original) {
    addBaseUrl(snapshots, original, key)
  }

  return snapshots
}

function asArray<T>(elements: T[]): T[] | undefined {
  if (!elements) {
    return undefined
  }
  if (elements instanceof Array) {
    return elements
  }
  return [elements]
}

type ProfileMetadata = {
  avatars: {
    name: string
    description: string
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
  wearables: any
}
