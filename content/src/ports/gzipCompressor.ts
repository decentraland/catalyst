import destroy from 'destroy'
import * as path from 'path'
import { pipeline } from 'stream'
import { promisify } from 'util'
import { createGzip, createUnzip } from 'zlib'
import { AppComponents } from '../types'
const pipe = promisify(pipeline)

export type CompressionResult = {
  originalSize: number
  compressedSize: number
}

export interface FileCompressor {
  compress(sourceFilepath: string, destinationFilepath: string): Promise<CompressionResult>
  decompress(sourceFilepath: string, destinationFilepath: string): Promise<boolean>
}

export function createGzipCompressor(components: Pick<AppComponents, 'logs' | 'fs'>): FileCompressor {
  return {
    async compress(sourceFilepath: string, destinationFilepath: string) {
      sourceFilepath = path.resolve(sourceFilepath)
      destinationFilepath = path.resolve(destinationFilepath)

      if (sourceFilepath === destinationFilepath) {
        throw new Error("Can't compress a file using src==dst")
      }
      // Check output is not already there, or step on it
      const gzip = createGzip()
      const input = components.fs.createReadStream(sourceFilepath)
      const output = components.fs.createWriteStream(destinationFilepath)

      try {
        await pipe(input, gzip, output)
      } finally {
        destroy(input)
        destroy(output)
      }

      const originalSize = (await components.fs.stat(sourceFilepath)).size
      const compressedSize = (await components.fs.stat(destinationFilepath)).size

      return {
        originalSize,
        compressedSize
      }
    },
    async decompress(sourceFilepath: string, destinationFilepath: string) {
      sourceFilepath = path.resolve(sourceFilepath)
      destinationFilepath = path.resolve(destinationFilepath)
      if (sourceFilepath === destinationFilepath) {
        throw new Error("Can't compress a file using src==dst")
      }
      // Check output is not already there, or step on it
      const unZip = createUnzip()
      const input = components.fs.createReadStream(sourceFilepath)
      const output = components.fs.createWriteStream(destinationFilepath)
      try {
        await pipe(input, unZip, output)
      } finally {
        destroy(input)
        destroy(output)
      }

      return Promise.resolve(true)
    }
  }
}
