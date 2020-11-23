import { Request, Response } from 'express'
import { filterENS } from '../ensFiltering'
import { SmartContentServerFetcher } from '../../../utils/SmartContentServerFetcher'
import { Entity } from 'dcl-catalyst-commons'

export async function getProfileById(fetcher: SmartContentServerFetcher, ensOwnerProviderUrl: string, req: Request, res: Response) {
    // Method: GET
    // Path: /:id
    const profileId:string = req.params.id
    let returnProfile: ProfileMetadata = { avatars:[] }
    try {
        const entities:Entity[] = await fetcher.fetchJsonFromContentServer(`/entities/profile?pointer=${profileId}`)
        if (entities && entities.length > 0 && entities[0].metadata) {
            const profile: ProfileMetadata = entities[0].metadata
            returnProfile = profile
            returnProfile = await markOwnedNames(fetcher, ensOwnerProviderUrl, profileId, returnProfile)
            returnProfile = addBaseUrlToSnapshots(fetcher.getExternalContentServerUrl(), returnProfile)
        }
    } catch { }
    res.send(returnProfile)
}

/**
 * Checks the ENSs and mark them that are owned by the user
 */
async function markOwnedNames(fetcher: SmartContentServerFetcher, theGraphBaseUrl: string, profileId: string, metadata: ProfileMetadata): Promise<ProfileMetadata> {
    const avatarsNames: string[] = metadata.avatars.map(profile => profile.name)
        .filter(name => name && name !== '')

    if (avatarsNames.length > 0) {
        const ownedENS = await filterENS(fetcher, theGraphBaseUrl, profileId, avatarsNames)
        const avatars = metadata.avatars.map(profile => (
            {
                ...profile,
                hasClaimedName: ownsENS(ownedENS, profile.name),
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
function addBaseUrlToSnapshots(baseUrl: string, metadata: ProfileMetadata): ProfileMetadata {
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

type ProfileMetadata = {
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
