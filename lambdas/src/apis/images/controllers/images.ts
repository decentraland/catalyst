import log4js from "log4js";
import { Request, Response } from "express";
import { SmartContentServerFetcher } from "../../../SmartContentServerFetcher";
import { Environment, EnvironmentConfig } from "../../../Environment";
import fs from "fs";
import sharp from "sharp";
import fetch from "node-fetch"
import { ensureDirectoryExists } from "decentraland-katalyst-commons/fsutils";

const LOGGER = log4js.getLogger("ImagesController");

const validSizes = ["128", "256", "512"];

class ServiceError extends Error {
  statusCode: number;

  constructor(message: string, code: number = 400) {
    super(message);
    this.statusCode = code;
  }
}

function validateSize(size: string) {
  if (!validSizes.includes(size)) {
    throw new ServiceError("Invalid size");
  }
}

async function getStorageLocation(env: Environment) {
  let root = env.getConfig<string>(EnvironmentConfig.LAMBDAS_STORAGE_LOCATION);

  while (root.endsWith("/")) {
    root = root.slice(0, -1);
  }

  await ensureDirectoryExists(root);

  return root;
}
export async function getResizedImage(env: Environment, fetcher: SmartContentServerFetcher, req: Request, res: Response) {
  // Method: GET
  // Path: /images/:cid/:size

  try {
    const { cid, size } = req.params;

    validateSize(size);

    const [stream, length]: [NodeJS.ReadableStream, number] = await getStreamFor(cid, size);

    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": length,
      ETag: cid,
      "Access-Control-Expose-Headers": "*",
      "Cache-Control": "public, max-age=31536000, immutable",
    });

    stream.pipe(res);
  } catch (e) {
    if (e instanceof ServiceError) {
      res.status(e.statusCode).send(JSON.stringify({ status: e.statusCode, message: e.message }));
    }
  }

  async function getFileStream(filePath: string): Promise<[NodeJS.ReadableStream, number]> {
    const stat = await fs.promises.stat(filePath);
    return [fs.createReadStream(filePath), stat.size];
  }

  async function downloadAndResize(cid: string, size: string, filePath: string) {
    const v3Url = (await fetcher.getContentServerUrl()) + `/contents/${cid}`;
    const contentServerResponse = await fetch(v3Url);

    if (contentServerResponse.ok) {
      const imageData = await contentServerResponse.arrayBuffer();
      try {
        await sharp(Buffer.from(imageData))
          .resize({ width: parseInt(size) })
          .toFile(filePath);
      } catch (error) {
        LOGGER.error(`Error while trying to conver image of ${cid} to size ${size}`, error);
        throw new ServiceError("Couldn't resize content. Is content a valid image?", 400);
      }
    } else if (contentServerResponse.status === 404) {
      throw new ServiceError("Content not found in server", 404);
    } else {
      const body = await contentServerResponse.text();
      throw new ServiceError(`Unexpected response from server: ${contentServerResponse.status} - ${body}`, 500);
    }
  }

  async function getStreamFor(cid: string, size: string) {
    const storageLocation = await getStorageLocation(env);
    const filePath = `${storageLocation}/${cid}_${size}`;

    try {
      return await getFileStream(filePath);
    } catch (e) {
      await downloadAndResize(cid, size, filePath);
      return await getFileStream(filePath);
    }
  }
}
