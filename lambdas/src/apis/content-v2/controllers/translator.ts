import { Request, Response } from 'express'
import log4js from 'log4js'
import fetch from 'node-fetch'
import { asArray } from '../../../utils/ControllerUtils'
import { SmartContentServerFetcher } from '../../../utils/SmartContentServerFetcher'

const LOGGER = log4js.getLogger('ContentTranslator')

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

export async function getInfo(fetcher: SmartContentServerFetcher, req: Request, res: Response) {
  // Method: GET
  // Path: /parcel_info
  // Query String: ?cids={id[]}
  const cids: string[] = asArray(req.query.cids as string[])
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
