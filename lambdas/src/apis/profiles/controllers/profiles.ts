import { Request, Response } from 'express'
import fetch from "node-fetch"
import { Environment } from '../../../Environment'
import { baseContentServerUrl } from '../../../EnvironmentUtils'

export function getProfileById(env: Environment, req: Request, res: Response) {
    // Method: GET
    // Path: /:id
    const profileId:string = req.params.id
    const v3Url = baseContentServerUrl(env) + `/entities/profile?pointer=${profileId}`
    fetch(v3Url)
    .then(response => response.json())
    .then((entities:V3ControllerEntity[]) => {
        if (entities.length > 0 && entities[0].metadata) {
            res.send(addBaseUrlToSnapshots(baseContentServerUrl(env), entities[0].metadata))
        } else {
            res.send([])
        }
    })
}

/**
 * The content server provides the snapshots' hashes, but clients expect a full url. So in this
 * method, we replace the hashes by urls that would trigger the snapshot download.
 */
function addBaseUrlToSnapshots(baseUrl: string, metadata: EntityMetadata): EntityMetadata {
    const avatars = metadata.avatars.map(profile => (
        {
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
