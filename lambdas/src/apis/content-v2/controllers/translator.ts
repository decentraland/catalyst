import { Request, Response } from 'express'
import fetch from "node-fetch"
import { Response as NodeFetchResponse } from "node-fetch"
import { Environment } from '../../../Environment'
import { baseContentServerUrl } from '../../../EnvironmentUtils'


export function getScenes(env: Environment, req: Request, res: Response) {
    // Method: GET
    // Path: /scenes
    // Query String: ?x1={number}&x2={number}&y1={number}&y2={number}
    const x1:number = req.query.x1
    const x2:number = req.query.x2
    const y1:number = req.query.y1
    const y2:number = req.query.y2
    let pointers: string[] = []
    for(let x=x1; x<=x2; x++) {
        for(let y=y1; y<=y2; y++) {
            pointers.push(`pointer=${x},${y}`)
        }
    }
    const pointerParams = pointers.join('&')
    const v3Url = baseContentServerUrl(env) + `/entities/scenes?${pointerParams}`
    fetch(v3Url)
    .then(response => response.json())
    .then((entities:V3ControllerEntity[]) => {
        let scenesResult: ScenesResult = {data:[]}
        entities.forEach((entity: V3ControllerEntity) => {
            entity.pointers.forEach(pointer => {
                scenesResult.data.push({
                    parcel_id: pointer,
                    root_cid: entity.id,
                    scene_cid: findSceneJsonId(entity),
                })
            })
        })
        res.send(scenesResult)
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

interface ScenesResult {
    data: ScenesItem[],
}

interface ScenesItem {
    parcel_id: string,
    root_cid: string,
    scene_cid: string,
}


export function getInfo(env: Environment, req: Request, res: Response) {
    // Method: GET
    // Path: /parcel_info
    // Query String: ?cids={id[]}
    const cids:string[] = asArray(req.query.cids)
    const ids = cids.map(cid => `id=${cid}`)
    const idParams = ids.join('&')
    const v3Url = baseContentServerUrl(env) + `/entities/scenes?${idParams}`
    fetch(v3Url)
    .then(response => response.json())
    .then((entities:V3ControllerEntity[]) => {
        let parcelInfoResult: ParcelInfoResult = {data:[]}
        entities.forEach((entity: V3ControllerEntity) => {
            parcelInfoResult.data.push({
                root_cid: entity.id,
                scene_cid: findSceneJsonId(entity),
                content: {
                    parcel_id: entity.pointers[0],
                    contents: entity.content ?? [],
                    root_cid: entity.id,
                    publisher: "",
                }
            })
        })
        res.send(parcelInfoResult)
    })
}

function asArray<T>(elements: T[]|T): T[] {
    if (!elements) {
        return []
    }
    if (elements instanceof Array) {
        return elements
    }
    return [elements]
}


interface ParcelInfoResult {
    data: ParcelInfoItem[],
}

interface ParcelInfoItem {
    root_cid: string,
    scene_cid: string,
    content: {
        parcel_id: string,
        contents: {
            file: string,
            hash: string,
        }[]
        root_cid: string,
        publisher: string,
    }

}

export async function getContents(env: Environment, req: Request, res: Response) {
    // Method: GET
    // Path: /contents/:cid
    const cid = req.params.cid;

    const v3Url = baseContentServerUrl(env) + `/contents/${cid}`
    const contentServerResponse = await fetch(v3Url)
    if (contentServerResponse.ok) {
        copySuccessResponse(contentServerResponse, res)
    } else {
        if (contentServerResponse.status===404) {
            // Let's try on the old content server
            const legacyContentServerResponse = await fetch(`https://content.decentraland.org/contents/${cid}`)
            if (legacyContentServerResponse.ok) {
                copySuccessResponse(legacyContentServerResponse, res)
            } else {
                res.status(404).send()
            }
        } else {
            res.status(404).send()
        }
    }
}

function copySuccessResponse(responseFrom: NodeFetchResponse, responseTo: Response) {
    copyHeaders(responseFrom, responseTo)
    responseTo.status(200);
    responseFrom.body.pipe(responseTo);
}

function copyHeaders(responseFrom: NodeFetchResponse, responseTo: Response) {
    responseTo.setHeader("Access-Control-Allow-Origin", "*")
    responseTo.setHeader("Access-Control-Expose-Headers", "*")
    responseTo.setHeader("Content-Type", "application/octet-stream")
    responseTo.setHeader("ETag", responseFrom.headers.get("ETag")!)
    // responseFrom.headers.forEach((headerValue, headerName) => {
    //     responseTo.setHeader(headerName, headerValue)
    // })
}
function findSceneJsonId(entity:V3ControllerEntity): string {
    let sceneJsonHash = ""
    try {
        if (entity.content) {
            const sceneJsonContent: V3ControllerEntityContent|undefined = entity.content.find(entityContent => entityContent.file==="scene.json")
            if (sceneJsonContent) {
                sceneJsonHash = sceneJsonContent.hash
            }
        }
    } catch(e) {
        console.error("Error while looking for scene.json file hash. ", e)
    }
    return sceneJsonHash
}