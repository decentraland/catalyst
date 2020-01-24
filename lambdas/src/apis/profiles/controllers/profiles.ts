import { Request, Response } from 'express'
import fetch from "node-fetch"
import { Environment } from '../../../Environment'
import { baseContentServerUrl } from '../../../EnvironmentUtils'
import { getOwnedENS } from '../ensFiltering'

export async function getProfileById(env: Environment, req: Request, res: Response) {
    // Method: GET
    // Path: /:id
    const profileId:string = req.params.id
    const v3Url = baseContentServerUrl(env) + `/entities/profile?pointer=${profileId}`
    const response = await fetch(v3Url)
    let returnProfile: EntityMetadata = { avatars:[] }
    if (response.ok) {
        const entities:V3ControllerEntity[] = await response.json()
        if (entities && entities.length > 0 && entities[0].metadata) {
            const profile = entities[0].metadata
            returnProfile = profile
            returnProfile = await filterNonOwnedNames(profileId, returnProfile)
            returnProfile = addBaseUrlToSnapshots(baseContentServerUrl(env), returnProfile)
        }
    }
    res.send(returnProfile)
}

/**
 * We filter ENS to avoid send an ENS that is no longer owned by the user
 */
async function filterNonOwnedNames(profileId: string, metadata: EntityMetadata): Promise<EntityMetadata> {
    const ownedENS = await getOwnedENS(profileId)
    const avatars = await Promise.all(metadata.avatars.map(async profile => (
        {
            ...profile,
            name: ownsENS(ownedENS, profile.name) ? profile.name : '',
        })))
    return { avatars }
}

function ownsENS(ownedENS: string[], ensToCheck: string): boolean {
    return ownedENS.findIndex(ens => ens===ensToCheck) >= 0
}

/**
 * The content server provides the snapshots' hashes, but clients expect a full url. So in this
 * method, we replace the hashes by urls that would trigger the snapshot download.
 */
function addBaseUrlToSnapshots(baseUrl: string, metadata: EntityMetadata): EntityMetadata {
    const avatars = metadata.avatars.map(profile => (
        {
            ...profile,
            name: profile.name,
            description: profile.description,
            avatar: {
                ...profile.avatar,
                snapshots:{
                    face: baseUrl + `/contents/${profile.avatar.snapshots.face}`,
                    body: baseUrl + `/contents/${profile.avatar.snapshots.body}`
                }
            }
        }))
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

type Avatar = {
    bodyShape: any,
    eyes: any,
    hair: any,
    skin: any,
    snapshots: {
        body: string,
        face: string
    },
    version: number,
    wearables: any,
}
