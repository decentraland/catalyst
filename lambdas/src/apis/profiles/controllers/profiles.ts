import { Request, Response } from 'express'
import fetch from "node-fetch"
import { Environment, EnvironmentConfig } from '../../../Environment'
import { filterENS } from '../ensFiltering'
import { SmartContentServerFetcher } from '../../../SmartContentServerFetcher'

export async function getProfileById(env: Environment, fetcher: SmartContentServerFetcher, req: Request, res: Response) {
    // Method: GET
    // Path: /:id
    const profileId:string = req.params.id
    const v3Url = (await fetcher.getContentServerUrl()) + `/entities/profile?pointer=${profileId}`
    const response = await fetch(v3Url)
    let returnProfile: EntityMetadata = { avatars:[] }
    if (response.ok) {
        const entities:V3ControllerEntity[] = await response.json()
        if (entities && entities.length > 0 && entities[0].metadata) {
            const theGraphBaseUrl:string = env.getConfig(EnvironmentConfig.ENS_OWNER_PROVIDER_URL);
            const profile = entities[0].metadata
            returnProfile = profile
            returnProfile = await filterNonOwnedNames(theGraphBaseUrl, profileId, returnProfile)
            returnProfile = addBaseUrlToSnapshots(fetcher.getExternalContentServerUrl(), returnProfile)
        }
    }
    res.send(returnProfile)
}

/**
 * We filter ENS to avoid send an ENS that is no longer owned by the user
 */
async function filterNonOwnedNames(theGraphBaseUrl: string, profileId: string, metadata: EntityMetadata): Promise<EntityMetadata> {
    const avatarsNames: string[] = metadata.avatars.map(profile => profile.name)
        .filter(name => name && name !== '')

    if (avatarsNames.length>0) {
        const ownedENS = await filterENS(theGraphBaseUrl, profileId, avatarsNames)
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

interface V3ControllerEntity {
    id: string
    type: string
    pointers: string[]
    timestamp: number
    content?: V3ControllerEntityContent[]
    metadata?: EntityMetadata
}

interface V3ControllerEntityContent {
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
