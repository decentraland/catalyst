import { ChainId } from '@dcl/schemas'
import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { TheGraphClient } from '@katalyst/lambdas/utils/TheGraphClient'
import { Entity, EntityType } from 'dcl-catalyst-commons'
import { Request, Response } from 'express'
import { BASE_AVATARS_COLLECTION_ID } from '../off-chain/OffChainWearablesManager'
import { Collection, ERC721StandardTrait, WearableBodyShape, WearableMetadata, WearableMetadataRepresentation } from '../types'
import { createExternalContentUrl, findHashForFile, preferEnglish } from '../Utils'

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
      const wearableMetadata: WearableMetadata = entity.metadata
      const name = preferEnglish(wearableMetadata.i18n)
      const totalEmission = RARITIES_EMISSIONS[wearableMetadata.rarity]
      const description = emission ? `DCL Wearable ${emission}/${totalEmission}` : ''
      const image = createExternalContentUrl(client, entity, wearableMetadata.image)
      const thumbnail = createExternalContentUrl(client, entity, wearableMetadata.thumbnail)
      const bodyShapeTraits = getBodyShapes(wearableMetadata.data.representations).reduce((bodyShapes: ERC721StandardTrait[], bodyShape) => {
        bodyShapes.push({
          trait_type: 'Body Shapes',
          value: bodyShape
        })

        return bodyShapes
      }, [])

      const tagTraits = wearableMetadata.data.tags.reduce((tags: ERC721StandardTrait[], tag) => {
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
            value: wearableMetadata.rarity
          },
          {
            trait_type: 'Category',
            value: wearableMetadata.data.category
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
    case ChainId.ETHEREUM_ROPSTEN:
      return 'ropsten'
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
  selector: (metadata: WearableMetadata) => string | undefined
): Promise<void> {
  try {
    const entity = await fetchEntity(client, urn)
    if (entity) {
      const wearableMetadata: WearableMetadata = entity.metadata
      const hash = findHashForFile(entity, selector(wearableMetadata))
      if (hash) {
        const headers: Map<string, string> = await client.pipeContent(hash, (res as any) as ReadableStream<Uint8Array>)
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
  const entities: Entity[] = await client.fetchEntitiesByPointers(EntityType.WEARABLE, [urn])
  return entities && entities.length > 0 && entities[0].metadata ? entities[0] : undefined
}

export function getBodyShapes(representations: WearableMetadataRepresentation[]) {
  const bodyShapes = new Set<WearableBodyShape>()
  for (const representation of representations) {
    for (const bodyShape of representation.bodyShapes) {
      bodyShapes.add(bodyShape.split(':').pop()!)
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
