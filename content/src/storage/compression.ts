import destroy from 'destroy'
import * as fs from 'fs'
import * as path from 'path'
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
  if (result) {
    const ratio = ((result.compressedSize * 100) / result.originalSize).toFixed(2)
    console.info(`Content file compressed. ratio=${ratio}% file=${contentFilePath}`)
  }
}

async function gzipCompressFile(input: string, output: string): Promise<CompressionResult | null> {
  if (path.resolve(input) == path.resolve(output)) throw new Error("Can't compress a file using src==dst")
  const gzip = createGzip()
  const source = fs.createReadStream(input)
  const destination = fs.createWriteStream(output)

  const destinationCompressionFinishedFuture = new Promise<void>((resolve, reject) => {
    destination.on('finish', resolve)
    destination.on('close', resolve)
    destination.on('end', resolve)
    destination.on('error', reject)
  })

  const sourceCompressionFinishedFuture = new Promise<void>((resolve, reject) => {
    destination.on('finish', resolve)
    destination.on('close', resolve)
    destination.on('end', resolve)
    destination.on('error', reject)
  })

  try {
    await pipe(source, gzip, destination)
  } finally {
    destroy(source)
    destroy(destination)
  }

  await destinationCompressionFinishedFuture
  await sourceCompressionFinishedFuture

  const originalSize = await fs.promises.lstat(input)
  const newSize = await fs.promises.lstat(output)

  // if (newSize.size * 1.1 > originalSize.size) {
  //   // if the new file is bigger than the original file then we delete the compressed file
  //   // the 1.1 magic constant is to establish a gain of at least 10% of the size to justify the
  //   // extra CPU of the decompression
  //   fs.unlink(output, () => {})
  //   return null
  // }

  return {
    originalSize: originalSize.size,
    compressedSize: newSize.size
  }
}
