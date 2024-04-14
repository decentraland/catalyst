import { BodyShape, ChainId, Emote, Entity, StandardProps, Wearable, WearableRepresentation } from '@dcl/schemas'
import { Request, Response } from 'express'
import { TheGraphClient } from '../../../ports/the-graph/types'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { createExternalContentUrl, findHashForFile, preferEnglish } from '../Utils'
import { BASE_AVATARS_COLLECTION_ID } from '../off-chain/OffChainWearablesManager'
import { Collection, ERC721StandardTrait } from '../types'

type StandardWearable = Wearable & StandardProps
type StandardEmote = Emote & StandardProps
type ItemData = {
  replaces?: any[]
  hides?: any[]
  tags: string[]
  representations: any[]
  category: any
}

export async function getStandardErc721(client: SmartContentClient, req: Request, res: Response) {
  // Method: GET
  // Path: /standard/erc721/:chainId/:contract/:option/:emission
  const { chainId, contract, option } = req.params
  const emission: string | undefined = req.params.emission
  const protocol = getProtocol(chainId)

  if (!protocol) {
    return res.status(400).send(`Invalid chainId '${chainId}'`)
  }

  try {
    const urn = buildUrn(protocol, contract, option)
    const entity = await fetchEntity(client, urn)
    if (entity) {
      const itemMetadata: StandardWearable | StandardEmote = entity.metadata
      const name = preferEnglish(itemMetadata.i18n)
      if (!itemMetadata.rarity) {
        throw new Error('Wearable is not standard.')
      }

      const totalEmission = RARITIES_EMISSIONS[itemMetadata.rarity]
      const description = emission ? `DCL Wearable ${emission}/${totalEmission}` : ''
      const image = createExternalContentUrl(client, entity, itemMetadata.image)
      const thumbnail = createExternalContentUrl(client, entity, itemMetadata.thumbnail)
      const itemData: ItemData =
        (itemMetadata as StandardEmote).emoteDataADR74 ?? (itemMetadata as StandardWearable).data
      const bodyShapeTraits = getBodyShapes(itemData.representations).reduce(
        (bodyShapes: ERC721StandardTrait[], bodyShape) => {
          bodyShapes.push({
            trait_type: 'Body Shape',
            value: bodyShape
          })
          return bodyShapes
        },
        []
      )
      const tagTraits = itemData.tags.reduce((tags: ERC721StandardTrait[], tag) => {
        tags.push({
          trait_type: 'Tag',
          value: tag
        })
        return tags
      }, [])

      const standardErc721 = {
        id: urn,
        name,
        description,
        language: 'en-US',
        image,
        thumbnail,
        attributes: [
          {
            trait_type: 'Rarity',
            value: itemMetadata.rarity
          },
          {
            trait_type: 'Category',
            value: itemData.category
          },
          ...tagTraits,
          ...bodyShapeTraits
        ]
      }
      res.send(standardErc721)
    } else {
      res.status(404).send()
    }
  } catch (e) {
    res.status(500).send(e.message)
  }
}

export async function contentsImage(client: SmartContentClient, req: Request, res: Response): Promise<void> {
  // Method: GET
  // Path: /contents/:urn/image
  const { urn } = req.params
  await internalContents(client, res, urn, (wearableMetadata) => wearableMetadata.image)
}

export async function contentsThumbnail(client: SmartContentClient, req: Request, res: Response): Promise<void> {
  // Method: GET
  // Path: /contents/:urn/thumbnail
  const { urn } = req.params

  await internalContents(client, res, urn, (wearableMetadata) => wearableMetadata.thumbnail)
}

export async function getCollectionsHandler(
  theGraphClient: TheGraphClient,
  req: Request,
  res: Response
): Promise<void> {
  // Method: GET
  // Path: /

  try {
    const collections: Collection[] = await getCollections(theGraphClient)
    res.send({ collections })
  } catch (error) {
    res.status(500).send(error.message)
  }
}

export async function getCollections(theGraphClient: TheGraphClient): Promise<Collection[]> {
  const onChainCollections = await theGraphClient.getAllCollections()
  return [
    {
      id: BASE_AVATARS_COLLECTION_ID,
      name: 'Base Wearables'
    },
    ...onChainCollections.map(({ urn, name }) => ({ id: urn, name }))
  ]
}

function getProtocol(chainId: string): string | undefined {
  switch (parseInt(chainId, 10)) {
    case ChainId.ETHEREUM_MAINNET:
      return 'ethereum'
    case ChainId.ETHEREUM_SEPOLIA:
      return 'sepolia'
    case ChainId.ETHEREUM_RINKEBY:
      return 'rinkeby'
    case ChainId.ETHEREUM_GOERLI:
      return 'goerli'
    case ChainId.ETHEREUM_KOVAN:
      return 'kovan'
    case ChainId.MATIC_MAINNET:
      return 'matic'
    case ChainId.MATIC_MUMBAI:
      return 'mumbai'
    case ChainId.MATIC_AMOY:
      return 'amoy'
  }
}

function buildUrn(protocol: string, contract: string, option: string): string {
  const version = contract.startsWith('0x') ? 'v2' : 'v1'
  return `urn:decentraland:${protocol}:collections-${version}:${contract}:${option}`
}

async function internalContents(
  client: SmartContentClient,
  res: Response,
  urn: string,
  selector: (metadata: Wearable) => string | undefined
): Promise<void> {
  try {
    const entity = await fetchEntity(client, urn)
    if (entity) {
      const wearableMetadata: Wearable = entity.metadata
      const hash = findHashForFile(entity, selector(wearableMetadata))
      if (hash) {
        const headers: Map<string, string> = await client.pipeContent(hash, res as any as ReadableStream<Uint8Array>)
        headers.forEach((value: string, key: string) => {
          res.setHeader(key, value)
        })
      } else {
        res.status(404).send()
      }
    }
  } catch (e) {
    res.status(500).send(e.message)
  }
}

async function fetchEntity(client: SmartContentClient, urn: string): Promise<Entity | undefined> {
  const entities: Entity[] = await client.fetchEntitiesByPointers([urn])
  return entities && entities.length > 0 && entities[0].metadata ? entities[0] : undefined
}

export function getBodyShapes(representations: WearableRepresentation[]) {
  const bodyShapes = new Set<string>()
  for (const representation of representations) {
    for (const bodyShape of representation.bodyShapes) {
      if (bodyShape === BodyShape[BodyShape.MALE]) {
        bodyShapes.add('BaseMale')
      } else if (bodyShape === BodyShape[BodyShape.FEMALE]) {
        bodyShapes.add('BaseFemale')
      }
    }
  }
  return Array.from(bodyShapes)
}

const RARITIES_EMISSIONS = {
  common: 100000,
  uncommon: 10000,
  rare: 5000,
  epic: 1000,
  legendary: 100,
  mythic: 10,
  unique: 1
}
