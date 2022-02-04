import fs from 'fs'
import sharp from 'sharp'
import { metricsComponent } from '../metrics'
import { checkFileExists } from './files'

export type ImageRequest = {
  urn: string
  hash: string
  size: string
  rarityBackground?: string
}
export type ImageStorageCache = {
  getImagePath(root: string, imageRequest: ImageRequest): string
  getImageRequestId({ urn, hash, size, rarityBackground }: ImageRequest): string
  pruneObsoleteImages(root: string, urn: string, hash: string): Promise<void>
  cleanFolder(folderPath: string): Promise<void>
  getStorageSize(rootStorageLocation: string): Promise<number>
  storeImage(rootStoragePath: string, imageRequest: ImageRequest, finalImage: sharp.Sharp): Promise<void>
}

export const createImageStorageCache = (): ImageStorageCache => ({
  getImagePath: (root, imageRequest) => root + `/images/` + getImageRequestId(imageRequest) + '.png',
  getImageRequestId: ({ urn, hash, size, rarityBackground }) =>
    `${urn}/${hash}/${rarityBackground ?? 'thumbnail'}-${size}`,
  pruneObsoleteImages: async (root, urn, hash) => {
    const existsFolder = await checkFileExists(root + `/images/` + urn + '/' + hash)
    if (!existsFolder) await cleanFolder(root + `/images/` + urn)
  },
  cleanFolder: async (folderPath) => await fs.promises.rm(folderPath, { recursive: true, force: true }),
  getStorageSize: async (rootStorageLocation) => (await fs.promises.stat(rootStorageLocation + `/images`)).size,
  storeImage: async (rootStoragePath, imageRequest, finalImage) => {
    const imagesFolder = rootStoragePath + `/images`
    const urnFolder = imagesFolder + `/${imageRequest.urn}`
    const hashFolder = urnFolder + `/${imageRequest.hash}`
    const imagePath = getImagePath(rootStoragePath, imageRequest)

    // ensure folder structure exists before write
    await fs.promises.mkdir(hashFolder, { recursive: true })

    const outputInfo = await finalImage.png().toFile(imagePath)

    metricsComponent.increment('images_built_count', {
      image_dimensions: imageRequest.size,
      image_size: outputInfo.size
    })
  }
})
export function getImagePath(root: string, imageRequest: ImageRequest): string {
  return root + `/images/` + getImageRequestId(imageRequest) + '.png'
}

// Using this folder structure allow us to find and remove older versions of the same urn (entity)
export function getImageRequestId({ urn, hash, size, rarityBackground }: ImageRequest): string {
  return `${urn}/${hash}/${rarityBackground ?? 'thumbnail'}-${size}`
}

// Delete all images that are not the latest version (same hash)
export async function pruneObsoleteImages(root: string, urn: string, hash: string) {
  const existsFolder = await checkFileExists(root + `/images/` + urn + '/' + hash)
  if (!existsFolder) await cleanFolder(root + `/images/` + urn)
}

export async function cleanFolder(folderPath: string) {
  await fs.promises.rm(folderPath, { recursive: true, force: true })
}

export async function getStorageSize(rootStorageLocation: string): Promise<number> {
  const stat = await fs.promises.stat(rootStorageLocation + `/images`)
  return stat.size
}

export async function storeImage(rootStoragePath: string, imageRequest: ImageRequest, finalImage: sharp.Sharp) {
  const imagesFolder = rootStoragePath + `/images`
  const urnFolder = imagesFolder + `/${imageRequest.urn}`
  const hashFolder = urnFolder + `/${imageRequest.hash}`
  const imagePath = getImagePath(rootStoragePath, imageRequest)

  // ensure folder structure exists before write
  await fs.promises.mkdir(hashFolder, { recursive: true })

  const outputInfo = await finalImage.png().toFile(imagePath)

  metricsComponent.increment('images_built_count', { image_dimensions: imageRequest.size, image_size: outputInfo.size })
}
