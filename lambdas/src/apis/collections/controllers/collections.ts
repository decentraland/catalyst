import { Entity } from 'dcl-catalyst-commons'
import { Request, Response } from 'express'
import { SmartContentServerFetcher } from '../../../utils/SmartContentServerFetcher'

export async function getStandardErc721(fetcher: SmartContentServerFetcher, req: Request, res: Response) {
  // Method: GET
  // Path: /standard/erc721/:contract/:option/:emission
  const { contract, option } = req.params
  const emission: string | undefined = req.params.emission

  try {
    const entities: Entity[] = await fetcher.fetchJsonFromContentServer(
      `/entities/wearable?pointer=${contract}-${option}`
    )
    if (entities && entities.length > 0 && entities[0].metadata) {
      const wearableMetadata: WearableMetadata = entities[0].metadata
      const id = `dcl://${contract}/${option}`
      const name = wearableMetadata.name
      const totalEmission = RARITIES_EMISSIONS[wearableMetadata.rarity]
      const description = emission ? `DCL Wearable ${emission}/${totalEmission}` : ''
      const image = createExternalContentUrl(fetcher, entities[0], wearableMetadata.image)
      const thumbnail = createExternalContentUrl(fetcher, entities[0], wearableMetadata.thumbnail)
      const standardErc721 = {
        id,
        name,
        description,
        language: 'en-US',
        image,
        thumbnail
      }
      res.send(standardErc721)
    } else {
      res.status(404).send()
    }
  } catch (e) {
    console.log(e)
    res.status(500).send(e.messsge)
  }
}

export async function contentsImage(fetcher: SmartContentServerFetcher, req: Request, res: Response) {
  // Method: GET
  // Path: /contents/:contract/:option/image
  const { contract, option } = req.params

  await internalContents(fetcher, res, contract, option, (wearableMetadata) => wearableMetadata.image)
}

export async function contentsThumbnail(fetcher: SmartContentServerFetcher, req: Request, res: Response) {
  // Method: GET
  // Path: /contents/:contract/:option/thumbnail
  const { contract, option } = req.params

  await internalContents(fetcher, res, contract, option, (wearableMetadata) => wearableMetadata.thumbnail)
}

async function internalContents(
  fetcher: SmartContentServerFetcher,
  res: Response,
  contract: string,
  option: string,
  selector: (WearableMetadata: WearableMetadata) => string | undefined
) {
  try {
    let contentBuffer: Buffer | undefined = undefined
    const entities: Entity[] = await fetcher.fetchJsonFromContentServer(
      `/entities/wearable?pointer=${contract}-${option}`
    )
    if (entities && entities.length > 0 && entities[0].metadata) {
      const wearableMetadata: WearableMetadata = entities[0].metadata
      const relativeContentUrl = createRelativeContentUrl(fetcher, entities[0], selector(wearableMetadata))
      if (relativeContentUrl) {
        contentBuffer = await fetcher.fetchBufferFromContentServer(relativeContentUrl) // TODO: fetch a stream instead of a Buffer. See https://github.com/decentraland/catalyst/issues/199
      }
    }
    if (contentBuffer) {
      res.send(contentBuffer)
    } else {
      res.status(404).send()
    }
  } catch (e) {
    console.log(e)
    res.status(500).send(e.messsge)
  }
}

function createExternalContentUrl(
  fetcher: SmartContentServerFetcher,
  entity: Entity,
  fileName: string | undefined
): string | undefined {
  const relativeUrl = createRelativeContentUrl(fetcher, entity, fileName)
  if (relativeUrl) {
    return fetcher.getExternalContentServerUrl() + relativeUrl
  }
  return undefined
}

function createRelativeContentUrl(
  fetcher: SmartContentServerFetcher,
  entity: Entity,
  fileName: string | undefined
): string | undefined {
  if (fileName) {
    const imageHash = entity.content?.find((item) => item.file === fileName)?.hash
    if (imageHash) {
      return '/contents/' + imageHash
    }
  }
  return undefined
}

export type WearableId = string // These ids are used as pointers on the content server

const RARITIES_EMISSIONS = {
  common: 100000,
  uncommon: 10000,
  rare: 5000,
  epic: 1000,
  legendary: 100,
  mythic: 10,
  unique: 1
}

type WearableMetadata = {
  name: string
  rarity: string
  image?: string
  thumbnail?: string
}
