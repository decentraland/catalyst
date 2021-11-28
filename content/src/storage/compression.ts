import destroy from 'destroy'
import * as path from 'path'
import * as fs from 'fs'
import { pipeline } from 'stream'
import { promisify } from 'util'
import { createGzip } from 'zlib'
const pipe = promisify(pipeline)

export type CompressionResult = {
  originalSize: number
  compressedSize: number
}

// this whole file can be extracted to a worker in a different process
export async function compressContentFile(contentFilePath: string) {
  const result = await gzipCompressFile(contentFilePath, contentFilePath + '.gzip')
  const ratio = ((result.compressedSize * 100) / result.originalSize).toFixed(2)
  console.info(`Content file compressed. ratio=${ratio}% file=${contentFilePath}`)
}

async function gzipCompressFile(input: string, output: string): Promise<CompressionResult> {
  if (path.resolve(input) == path.resolve(output)) throw new Error("Can't compress a file using src==dst")
  const gzip = createGzip()
  const source = fs.createReadStream(input)
  const destination = fs.createWriteStream(output)
  try {
    await pipe(source, gzip, destination)

    const originalSize = await fs.promises.lstat(input)
    const newSize = await fs.promises.lstat(output)

    return {
      originalSize: originalSize.size,
      compressedSize: newSize.size
    }
  } finally {
    destroy(source)
    destroy(destination)
  }
}
