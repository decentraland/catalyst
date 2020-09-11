import { Request, Response } from 'express'
import { filterENS } from '../ensFiltering'
import { SmartContentServerFetcher } from '../../../SmartContentServerFetcher'

export async function getProfileById(fetcher: SmartContentServerFetcher, ensOwnerProviderUrl: string, req: Request, res: Response) {
    // Method: GET
    // Path: /:id
    const profileId:string = req.params.id
    let returnProfile: EntityMetadata = { avatars:[] }
    try {
        const entities:V3ControllerEntity[] = await fetcher.fetchJsonFromContentServer(`/entities/profile?pointer=${profileId}`)
        if (entities && entities.length > 0 && entities[0].metadata) {
            const profile = entities[0].metadata
            returnProfile = profile
            returnProfile = await filterNonOwnedNames(fetcher, ensOwnerProviderUrl, profileId, returnProfile)
            returnProfile = addBaseUrlToSnapshots(fetcher.getExternalContentServerUrl(), returnProfile)
        }
    } catch { }
    res.send(returnProfile)
}

/**
 * We filter ENS to avoid send an ENS that is no longer owned by the user
 */
async function filterNonOwnedNames(fetcher: SmartContentServerFetcher, theGraphBaseUrl: string, profileId: string, metadata: EntityMetadata): Promise<EntityMetadata> {
    const avatarsNames: string[] = metadata.avatars.map(profile => profile.name)
        .filter(name => name && name !== '')

    if (avatarsNames.length > 0) {
        const ownedENS = await filterENS(fetcher, theGraphBaseUrl, profileId, avatarsNames)
        const avatars = metadata.avatars.map(profile => (
            {
                ...profile,
                name: ownsENS(ownedENS, profile.name) ? profile.name : '',
            }))
        return { avatars }
    }

    return metadata
}

function ownsENS(ownedENS: string[], ensToCheck: string): boolean {
    return ownedENS.findIndex(ens => ens===ensToCheck) >= 0
}

/**
 * The content server provides the snapshots' hashes, but clients expect a full url. So in this
 * method, we replace the hashes by urls that would trigger the snapshot download.
 */
function addBaseUrlToSnapshots(baseUrl: string, metadata: EntityMetadata): EntityMetadata {
    function addBaseUrl(dst: AvatarSnapshots, src: AvatarSnapshots, key: keyof AvatarSnapshots) {
        if(src[key]) {
            dst[key] = baseUrl + `/contents/${src[key]}`
        }
    }

    const avatars = metadata.avatars.map(profile => {
        const original = profile.avatar.snapshots;
        const snapshots: AvatarSnapshots = {}

        for(const key in original)  {
            addBaseUrl(snapshots, original, key)
        }

        return {
            ...profile,
            name: profile.name,
            description: profile.description,
            avatar: {
                ...profile.avatar,
                snapshots
            }
        };
    })

    return { avatars }
}

type V3ControllerEntity = {
    id: string
    type: string
    pointers: string[]
    timestamp: number
    content?: V3ControllerEntityContent[]
    metadata?: EntityMetadata
}

type V3ControllerEntityContent = {
    file: string,
    hash: string,
}

type EntityMetadata = {
    avatars: {
        name: string,
        description: string,
        avatar: Avatar,
    }[]
}

type AvatarSnapshots = Record<string, string>

type Avatar = {
    bodyShape: any,
    eyes: any,
    hair: any,
    skin: any,
    snapshots: AvatarSnapshots,
    version: number,
    wearables: any,
}
