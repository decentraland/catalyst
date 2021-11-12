import { ChainId } from '@dcl/schemas'
import { Entity, EntityType } from 'dcl-catalyst-commons'
import { Request, Response } from 'express'
import fs from 'fs'
import log4js from 'log4js'
import sharp from 'sharp'
import { metricsComponent } from '../../../metrics'
import { ServiceError } from '../../../utils/errors'
import { checkFileExists, getFileStream } from '../../../utils/files'
import { SmartContentClient } from '../../../utils/SmartContentClient'
import { TheGraphClient } from '../../../utils/TheGraphClient'
import { BASE_AVATARS_COLLECTION_ID } from '../off-chain/OffChainWearablesManager'
import {
  Collection,
  ERC721StandardTrait,
  WearableBodyShape,
  WearableMetadata,
  WearableMetadataRepresentation
} from '../types'
import { findHashForFile, preferEnglish } from '../Utils'

const logger = log4js.getLogger('Lambdas Collections')

export async function getStandardErc721(client: SmartContentClient, req: Request, res: Response): Promise<void> {
  // Method: GET
  // Path: /standard/erc721/:chainId/:contract/:option/:emission
  const { chainId, contract, option } = req.params
  const emission: string | undefined = req.params.emission
  const protocol = getProtocol(chainId)

  if (!protocol) {
    res.status(400).send(`Invalid chainId '${chainId}'`)
    return
  }

  try {
    const urn = buildUrn(protocol, contract, option)
    const entity = await fetchEntity(client, urn)

    const wearableMetadata: WearableMetadata = entity.metadata
    const name = preferEnglish(wearableMetadata.i18n)
    const totalEmission = RARITIES_EMISSIONS[wearableMetadata.rarity]
    const description = emission ? `DCL Wearable ${emission}/${totalEmission}` : ''
    const lambdasUrl = `https://${req.headers.host}/lambdas/collections/contents/${urn}`
    const image = lambdasUrl + '/image'
    const thumbnail = lambdasUrl + '/thumbnail'
    const bodyShapeTraits: ERC721StandardTrait[] = getBodyShapes(wearableMetadata.data.representations).map(
      (bodyShape) => ({
        trait_type: 'Body Shape',
        value: bodyShape
      })
    )

    const tagTraits: ERC721StandardTrait[] = wearableMetadata.data.tags.map((tag) => ({
      trait_type: 'Tag',
      value: tag
    }))

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
  } catch (e) {
    if (e instanceof ServiceError) {
      res.status(e.statusCode).send(e.message)
      return
    }
    res.status(500)
  }
}

export async function contentsThumbnail(
  client: SmartContentClient,
  req: Request,
  res: Response,
  storage: string
): Promise<void> {
  // Method: GET
  // Path: /contents/:urn/thumbnail/:size
  await handleImageRequest(client, req, res, storage, true)
}

export async function contentsImage(
  client: SmartContentClient,
  req: Request,
  res: Response,
  storage: string
): Promise<void> {
  // Method: GET
  // Path: /contents/:urn/image/:size
  await handleImageRequest(client, req, res, storage, false)
}

async function handleImageRequest(
  client: SmartContentClient,
  req: Request,
  res: Response,
  rootStorageLocation: string,
  isThumbnail: boolean
): Promise<void> {
  const { urn } = req.params
  const size = req.params.size ?? DEFAULT_IMAGE_SIZE

  try {
    validateSize(size)

    const entity = await fetchEntity(client, urn)
    const hash = getFileHash(entity, entity.metadata.thumbnail)

    await pruneObsoleteImages(rootStorageLocation, urn, hash)

    const imageRequest = {
      urn,
      hash,
      size,
      rarityBackground: isThumbnail ? undefined : entity.metadata?.rarity
    }

    const [stream, length]: [NodeJS.ReadableStream, number] = await getImage(client, rootStorageLocation, imageRequest)
    sendImage(res, stream, length, imageRequest)
  } catch (e) {
    if (e instanceof ServiceError) {
      res.status(e.statusCode).send(e.message)
      return
    }
    res.status(500)
    logger.error(e)
  }
}

function sendImage(res: Response, stream: NodeJS.ReadableStream, length: number, imageRequest: ImageRequest) {
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': length,
    ETag: JSON.stringify(getImageRequestId(imageRequest)),
    'Access-Control-Expose-Headers': '*',
    'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable'
  })
  stream.pipe(res)
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

function getRarityImagePath(rarity: string) {
  return `lambdas/resources/${rarity}.png`
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

function validateSize(size: string = DEFAULT_IMAGE_SIZE): size is ValidSize {
  if (!isValidSize(size)) throw new ServiceError('Invalid size')
  return true
}

function getFileHash(entity: Entity, fileName?: string): string {
  const hash = findHashForFile(entity, fileName)
  if (!hash) throw new ServiceError(`Hash not found for file ${fileName}`, 404)

  return hash
}

async function fetchEntity(client: SmartContentClient, urn: string): Promise<Entity> {
  const entities: Entity[] = await client.fetchEntitiesByPointers(EntityType.WEARABLE, [urn])
  if (!(entities && entities.length > 0 && entities[0].metadata)) throw new ServiceError('Entity not found', 404)

  return entities[0]
}

function getBodyShapes(representations: WearableMetadataRepresentation[]): string[] {
  const bodyShapes = new Set<WearableBodyShape>()
  for (const representation of representations) {
    for (const bodyShape of representation.bodyShapes) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      bodyShapes.add(bodyShape.split(':').pop()!)
    }
  }
  return Array.from(bodyShapes)
}

function isValidSize(size: string): size is ValidSize {
  return sizes[size] !== undefined
}

function getImagePath(root: string, imageRequest: ImageRequest): string {
  return root + `/images/` + getImageRequestId(imageRequest) + '.png'
}

// Using this folder structure allow us to find and remove older versions of the same urn (entity)
function getImageRequestId({ urn, hash, size, rarityBackground }: ImageRequest): string {
  return `${urn}/${hash}/${rarityBackground ?? 'thumbnail'}-${size}`
}

// Delete all images that are not the latest version (same hash)
async function pruneObsoleteImages(root: string, urn: string, hash: string) {
  const existsFolder = await checkFileExists(root + `/images/` + urn + '/' + hash)
  if (!existsFolder) await cleanFolder(root + `/images/` + urn)
}

async function cleanFolder(folderPath: string) {
  await fs.promises.rm(folderPath, { recursive: true, force: true })
}

async function getImage(
  client: SmartContentClient,
  rootStorageLocation: string,
  imageRequest: ImageRequest
): Promise<[NodeJS.ReadableStream, number]> {
  const path = getImagePath(rootStorageLocation, imageRequest)

  // Check if the image is already in the cache, otherwise build and store it
  if (await checkFileExists(path)) {
    metricsComponent.increment('cache_hit', { image_size: imageRequest.size })
  } else {
    metricsComponent.increment('cache_miss', { image_size: imageRequest.size })
    await saveImage(client, rootStorageLocation, imageRequest)

    const storageSize = await getStorageSize(rootStorageLocation)
    metricsComponent.observe('storage_size', {}, storageSize)
  }

  return await getFileStream(path)
}

async function getStorageSize(rootStorageLocation: string): Promise<number> {
  const stat = await fs.promises.stat(rootStorageLocation + `/images`)
  return stat.size
}

/**
 * Fetch image from the content service and resized image is stored in the cache.
 * When rarityBackground is present, it composes the image with the rarity background.
 */
async function saveImage(client: SmartContentClient, rootStorageLocation: string, imageRequest: ImageRequest) {
  const { end: endTimer } = metricsComponent.startTimer('image_generation_time')
  const image = await client.downloadContent(imageRequest.hash)
  const shouldResize = sizes[imageRequest.size] !== DEFAULT_IMAGE_SIZE
  let finalImage: sharp.Sharp
  if (imageRequest.rarityBackground) {
    const background = await getRarityBackground(imageRequest.rarityBackground, imageRequest.size)
    const resizedImage = shouldResize
      ? await sharp(image).resize(sizes[imageRequest.size], sizes[imageRequest.size]).toBuffer()
      : image
    finalImage = sharp(background).composite([{ input: resizedImage }])
  } else {
    finalImage = shouldResize ? sharp(image).resize(sizes[imageRequest.size], sizes[imageRequest.size]) : sharp(image)
  }
  await storeImage(rootStorageLocation, imageRequest, finalImage)
  endTimer()
}

async function storeImage(rootStoragePath: string, imageRequest: ImageRequest, finalImage: sharp.Sharp) {
  const imagesFolder = rootStoragePath + `/images`
  const urnFolder = imagesFolder + `/${imageRequest.urn}`
  const hashFolder = urnFolder + `/${imageRequest.hash}`
  const imagePath = getImagePath(rootStoragePath, imageRequest)

  // ensure folder structure exists before write
  await fs.promises.mkdir(hashFolder, { recursive: true })

  const outputInfo = await finalImage.png().toFile(imagePath)

  metricsComponent.increment('images_built_count', { image_dimensions: imageRequest.size, image_size: outputInfo.size })
}

async function getRarityBackground(rarity: string, size: string): Promise<Buffer> {
  const sizedRarity = `${rarity}-${size}`
  if (!rarityBackgrounds[sizedRarity]) {
    let image = sharp(getRarityImagePath(rarity))
    if (size !== DEFAULT_IMAGE_SIZE) image = image.resize(sizes[size], sizes[size])
    rarityBackgrounds[sizedRarity] = await image.toBuffer()
  }

  return rarityBackgrounds[sizedRarity]
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

const DEFAULT_IMAGE_SIZE = '1024'
type ValidSize = '128' | '256' | '512' | typeof DEFAULT_IMAGE_SIZE
const sizes: Record<ValidSize, number> = { '128': 128, '256': 256, '512': 512, '1024': 1024 }

const rarityBackgrounds: Record<string, Buffer> = {}

type ImageRequest = {
  urn: string
  hash: string
  size: string
  rarityBackground?: string
}
