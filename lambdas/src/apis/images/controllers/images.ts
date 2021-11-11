import { ensureDirectoryExists } from '@catalyst/commons'
import destroy from 'destroy'
import { Request, Response } from 'express'
import log4js from 'log4js'
import fetch from 'node-fetch'
import onFinished from 'on-finished'
import sharp from 'sharp'
import { ServiceError } from '../../../utils/errors'
import { getFileStream } from '../../../utils/files'
import { SmartContentServerFetcher } from '../../../utils/SmartContentServerFetcher'

const LOGGER = log4js.getLogger('ImagesController')

const validSizes = ['128', '256', '512']

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
    // Note: for context about why this is necessary, check https://github.com/nodejs/node/issues/1180
    onFinished(res, () => destroy(stream))
  } catch (e) {
    LOGGER.error(e)
    if (e instanceof ServiceError) {
      res.status(e.statusCode).send(JSON.stringify({ status: e.statusCode, message: e.message }))
    } else {
      res.status(500).end()
    }
  }

  async function downloadAndResize(cid: string, size: string, filePath: string) {
    const contentServerResponse = await fetchContentFromServer(fetcher, cid)

    if (contentServerResponse.ok) {
      try {
        const imageData = await contentServerResponse.arrayBuffer()
        await sharp(Buffer.from(imageData))
          .resize({ width: parseInt(size) })
          .toFile(filePath)
        return
      } catch (error) {
        LOGGER.error(`Error while trying to convert image of ${cid} to size ${size}`, error)
        throw new ServiceError("Couldn't resize content. Is content a valid image?", 400)
      }
    } else if (contentServerResponse.status === 404) {
      throw new ServiceError('Content not found in server', 404)
    } else {
      const body = await contentServerResponse.text()
      throw new ServiceError(`Unexpected response from server: ${contentServerResponse.status} - ${body}`, 500)
    }
  }

  async function getStreamFor(cid: string, size: string) {
    const filePath = await getFilePath(rooStorageLocation, cid, size)

    try {
      // First try to get it from fs if it's already stored
      return await getFileStream(filePath)
    } catch (e) {
      // Generate the image
      await downloadAndResize(cid, size, filePath)
      return await getFileStream(filePath)
    }
  }

  async function fetchContentFromServer(fetcher: SmartContentServerFetcher, cid: string) {
    const v3Url = (await fetcher.getContentServerUrl()) + `/contents/${cid}`
    const contentServerResponse = await fetch(v3Url)
    return contentServerResponse
  }

  async function getFilePath(rooStorageLocation: string, cid: string, size: string) {
    const storageLocation = await getStorageLocation(rooStorageLocation)
    return `${storageLocation}/${cid}_${size}`
  }
}
