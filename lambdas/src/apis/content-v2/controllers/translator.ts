import { Request, Response } from 'express'
import log4js from 'log4js'
import fetch, { Response as NodeFetchResponse } from 'node-fetch'
import { SmartContentServerFetcher } from '../../../utils/SmartContentServerFetcher'

const LOGGER = log4js.getLogger('ContentTranslator')
const MAX_SCENE_AREA: number = 100

export async function getScenes(fetcher: SmartContentServerFetcher, req: Request, res: Response) {
  // Method: GET
  // Path: /scenes
  // Query String: ?x1={number}&x2={number}&y1={number}&y2={number}
  const x1: number = parseInt(req.query.x1)
  const x2: number = parseInt(req.query.x2)
  const y1: number = parseInt(req.query.y1)
  const y2: number = parseInt(req.query.y2)

  // Make sure that all params are set, and that they are numbers
  if (isNaN(x1) || isNaN(x2) || isNaN(y1) || isNaN(y2)) {
    res.status(400).send(`Please make sure that all given parcels are set, and that they are numbers.`)
    return
  }

  // Calculate max and min for each coordinate
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)

  // Make sure that the specified rectangle meets the max size criteria
  const size = (maxX - minX + 1) * (maxY - minY + 1)
  if (size > MAX_SCENE_AREA) {
    res.status(400).send(`Please make sure that the specified area contains ${MAX_SCENE_AREA} or less parcels.`)
    return
  }

  // Calculate all inner parcels and transform them into pointers
  const pointers: string[] = []
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      pointers.push(`${x},${y}`)
    }
  }

  // If there are no pointers, then there is no need to query the content server
  if (pointers.length === 0) {
    res.send({ data: [] })
    return
  }

  // Calculate the url
  const pointerParams = 'pointer=' + pointers.join('&pointer=')
  const v3Url = (await fetcher.getContentServerUrl()) + `/entities/scenes?${pointerParams}`
  LOGGER.trace(`Querying the content server for scenes. Url is ${v3Url}`)

  // Perform the fetch
  const response = await fetch(v3Url)

  // If the request failed, then return the status code and text
  if (!response.ok) {
    const returnedText = await response.text()
    res.status(response.status).send(returnedText)
    LOGGER.warn(`Translation to content failed. Response status was ${response.status} and text was ${returnedText}`)
    return
  }

  const data: ScenesItem[] = []

  // Read the response, and transform it
  const entities: V3ControllerEntity[] = await response.json()
  entities.forEach((entity: V3ControllerEntity) => {
    entity.pointers.forEach((pointer) => {
      data.push({
        parcel_id: pointer,
        root_cid: entity.id,
        scene_cid: findSceneJsonId(entity)
      })
    })
  })

  // Return the result
  const scenesResult: ScenesResult = { data }
  res.send(scenesResult)
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
  file: string
  hash: string
}

interface ScenesResult {
  data: ScenesItem[]
}

interface ScenesItem {
  parcel_id: string
  root_cid: string
  scene_cid: string
}

export async function getInfo(fetcher: SmartContentServerFetcher, req: Request, res: Response) {
  // Method: GET
  // Path: /parcel_info
  // Query String: ?cids={id[]}
  const cids: string[] = asArray(req.query.cids)
  const ids = cids.map((cid) => `id=${cid}`)
  const idParams = ids.join('&')
  const v3Url = (await fetcher.getContentServerUrl()) + `/entities/scenes?${idParams}`
  await fetch(v3Url)
    .then((response) => response.json())
    .then((entities: V3ControllerEntity[]) => {
      const parcelInfoResult: ParcelInfoResult = { data: [] }
      entities.forEach((entity: V3ControllerEntity) => {
        parcelInfoResult.data.push({
          root_cid: entity.id,
          scene_cid: findSceneJsonId(entity),
          content: {
            parcel_id: entity.pointers[0],
            contents: entity.content ?? [],
            root_cid: entity.id,
            publisher: ''
          }
        })
      })
      res.send(parcelInfoResult)
    })
    .catch((e) => {
      LOGGER.error(`Error getting info for ${req.path}`, e)
      res.status(500).send(e.message ?? e.toString())
    })
}

function asArray<T>(elements: T[] | T): T[] {
  if (!elements) {
    return []
  }
  if (elements instanceof Array) {
    return elements
  }
  return [elements]
}

interface ParcelInfoResult {
  data: ParcelInfoItem[]
}

interface ParcelInfoItem {
  root_cid: string
  scene_cid: string
  content: {
    parcel_id: string
    contents: {
      file: string
      hash: string
    }[]
    root_cid: string
    publisher: string
  }
}

export async function getContents(fetcher: SmartContentServerFetcher, req: Request, res: Response) {
  // Method: GET
  // Path: /contents/:cid
  const cid = req.params.cid

  const v3Url = (await fetcher.getContentServerUrl()) + `/contents/${cid}`
  const contentServerResponse = await fetch(v3Url)
  if (contentServerResponse.ok) {
    copySuccessResponse(contentServerResponse, res)
  } else {
    if (contentServerResponse.status === 404) {
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
  responseTo.status(200)
  responseFrom.body.pipe(responseTo)
}

const KNOWN_HEADERS: string[] = [
  'Content-Type',
  'Access-Control-Allow-Origin',
  'Access-Control-Expose-Headers',
  'ETag',
  'Date',
  'Content-Length',
  'Cache-Control'
]
function fixHeaderNameCase(headerName: string): string | undefined {
  return KNOWN_HEADERS.find((item) => item.toLowerCase() === headerName.toLowerCase())
}

function copyHeaders(responseFrom: NodeFetchResponse, responseTo: Response) {
  responseFrom.headers.forEach((headerValue, headerName) => {
    const fixedHeader = fixHeaderNameCase(headerName)
    if (fixedHeader) {
      responseTo.setHeader(fixedHeader, headerValue)
    }
  })
}
function findSceneJsonId(entity: V3ControllerEntity): string {
  let sceneJsonHash = ''
  try {
    if (entity.content) {
      const sceneJsonContent: V3ControllerEntityContent | undefined = entity.content.find(
        (entityContent) => entityContent.file === 'scene.json'
      )
      if (sceneJsonContent) {
        sceneJsonHash = sceneJsonContent.hash
      }
    }
  } catch (e) {
    console.error('Error while looking for scene.json file hash. ', e)
  }
  return sceneJsonHash
}
