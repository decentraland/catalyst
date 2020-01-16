import { Request, Response } from 'express'
import fetch from "node-fetch"

export function getProfileById(req: Request, res: Response) {
    // Method: GET
    // Path: /:id
    const id:string = req.params.id
    const v3Url = `http://localhost:6969/entities/profile?pointer=${id}`
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
