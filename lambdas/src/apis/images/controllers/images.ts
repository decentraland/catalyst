import { ensureDirectoryExists } from '@catalyst/commons'
import { Request, Response } from 'express'
import future, { IFuture } from 'fp-future'
import log4js from 'log4js'
import fetch from 'node-fetch'
import sharp from 'sharp'
import { ServiceError } from '../../../utils/errors'
import { getFileStream } from '../../../utils/files'
import { SmartContentServerFetcher } from '../../../utils/SmartContentServerFetcher'

const LOGGER = log4js.getLogger('ImagesController')

const validSizes = ['128', '256', '512']

const existingDownloadsFutures: Record<string, IFuture<void>> = {}

function validateSize(size: string) {
  if (!validSizes.includes(size)) {
    throw new ServiceError('Invalid size')
  }
}

async function getStorageLocation(root: string): Promise<string> {
  while (root.endsWith('/')) {
    root = root.slice(0, -1)
  }

  await ensureDirectoryExists(root)

  return root
}

export async function getResizedImage(
  fetcher: SmartContentServerFetcher,
  rooStorageLocation: string,
  req: Request,
  res: Response
): Promise<void> {
  // Method: GET
  // Path: /images/:cid/:size

  try {
    const { cid, size } = req.params

    validateSize(size)

    const [stream, length]: [NodeJS.ReadableStream, number] = await getStreamFor(cid, size)

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': length,
      ETag: cid,
      'Access-Control-Expose-Headers': '*',
      'Cache-Control': 'public, max-age=31536000, immutable'
    })

    stream.pipe(res)
  } catch (e) {
    if (e instanceof ServiceError) {
      res.status(e.statusCode).send(JSON.stringify({ status: e.statusCode, message: e.message }))
    }
  }

  async function downloadAndResize(cid: string, size: string, filePath: string) {
    const downloadFuture = (existingDownloadsFutures[filePath] = future())

    try {
      const v3Url = (await fetcher.getContentServerUrl()) + `/contents/${cid}`
      const contentServerResponse = await fetch(v3Url)

      if (contentServerResponse.ok) {
        const imageData = await contentServerResponse.arrayBuffer()
        try {
          await sharp(Buffer.from(imageData))
            .resize({ width: parseInt(size) })
            .toFile(filePath)

          downloadFuture.resolve()
          if (existingDownloadsFutures[filePath] === downloadFuture) delete existingDownloadsFutures[filePath]
        } catch (error) {
          LOGGER.error(`Error while trying to conver image of ${cid} to size ${size}`, error)
          throw new ServiceError("Couldn't resize content. Is content a valid image?", 400)
        }
      } else if (contentServerResponse.status === 404) {
        throw new ServiceError('Content not found in server', 404)
      } else {
        const body = await contentServerResponse.text()
        throw new ServiceError(`Unexpected response from server: ${contentServerResponse.status} - ${body}`, 500)
      }
    } catch (e) {
      downloadFuture.reject(e)
      if (existingDownloadsFutures[filePath] === downloadFuture) delete existingDownloadsFutures[filePath]
      throw e
    }
  }

  async function getStreamFor(cid: string, size: string) {
    const storageLocation = await getStorageLocation(rooStorageLocation)
    const filePath = `${storageLocation}/${cid}_${size}`

    await existingDownloadOf(filePath)

    try {
      return await getFileStream(filePath)
    } catch (e) {
      if (!(await existingDownloadOf(filePath))) {
        await downloadAndResize(cid, size, filePath)
      }

      return await getFileStream(filePath)
    }
  }
}
async function existingDownloadOf(filePath: string): Promise<boolean> {
  const downloadFuture = existingDownloadsFutures[filePath]
  if (downloadFuture !== undefined) {
    await existingDownloadsFutures[filePath]
    return true
  }

  return false
}
