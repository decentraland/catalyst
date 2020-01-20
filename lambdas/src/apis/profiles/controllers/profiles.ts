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
        res.send(entities[0].metadata)
    })
}

interface V3ControllerEntity {
    id: string
    type: string
    pointers: string[]
    timestamp: number
    content?: V3ControllerEntityContent[]
    metadata?: any
}

interface V3ControllerEntityContent {
    file: string,
    hash: string,
}
