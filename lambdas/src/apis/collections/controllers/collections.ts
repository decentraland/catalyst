import { SmartContentClient } from '@katalyst/lambdas/utils/SmartContentClient'
import { Entity, EntityType } from 'dcl-catalyst-commons'
import { Request, Response } from 'express'
import { I18N, WearableMetadata } from '../types'
import { createExternalContentUrl, findHashForFile } from '../Utils'

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
      const standardErc721 = {
        id: urn,
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
    res.status(500).send(e.message)
  }
}

export async function contentsImage(client: SmartContentClient, req: Request, res: Response) {
  // Method: GET
  // Path: /contents/:urn/image
  const { urn } = req.params

  await internalContents(client, res, urn, (wearableMetadata) => wearableMetadata.image)
}

export async function contentsThumbnail(client: SmartContentClient, req: Request, res: Response) {
  // Method: GET
  // Path: /contents/:urn/thumbnail
  const { urn } = req.params

  await internalContents(client, res, urn, (wearableMetadata) => wearableMetadata.thumbnail)
}

/** We will prioritize the text in english. If not present, then we will choose the first one */
function preferEnglish(i18ns: I18N[]): string | undefined {
  const i18nInEnglish = i18ns.filter((i18n) => i18n.code.toLowerCase() === 'en')[0]
  return (i18nInEnglish ?? i18ns[0])?.text
}

function getProtocol(chainId: string): string | undefined {
  switch (chainId) {
    case '1':
      return 'ethereum'
    case '3':
      return 'ropsten'
    case '4':
      return 'rinkeby'
    case '5':
      return 'goerli'
    case '42':
      return 'kovan'
    case '89':
      return 'matic'
    case '13881':
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
) {
  try {
    let contentBuffer: Buffer | undefined = undefined
    const entity = await fetchEntity(client, urn)
    if (entity) {
      const wearableMetadata: WearableMetadata = entity.metadata
      const hash = findHashForFile(entity, selector(wearableMetadata))
      if (hash) {
        contentBuffer = await client.downloadContent(hash) // TODO: fetch a stream instead of a Buffer. See https://github.com/decentraland/catalyst/issues/199
      }
    }
    if (contentBuffer) {
      res.send(contentBuffer)
    } else {
      res.status(404).send()
    }
  } catch (e) {
    res.status(500).send(e.message)
  }
}

async function fetchEntity(client: SmartContentClient, urn: string): Promise<Entity | undefined> {
  const entities: Entity[] = await client.fetchEntitiesByPointers(EntityType.WEARABLE, [urn])
  return entities && entities.length > 0 && entities[0].metadata ? entities[0] : undefined
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
