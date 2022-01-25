import { Readable } from 'stream'

export type ContentEncoding = 'gzip'

export interface ContentStorage {
  /** @deprecated use storeStream instead */
  store(id: string, content: Uint8Array, encoding?: ContentEncoding): Promise<void>
  storeStream(id: string, content: Readable, encoding?: ContentEncoding): Promise<void>
  storeContent(id: string, content: Uint8Array | Readable, encoding?: ContentEncoding): Promise<void>
  storeFromFile(id: string, filePath: string, encoding?: ContentEncoding): Promise<void>
  delete(ids: string[]): Promise<void>
  retrieve(id: string): Promise<ContentItem | undefined>
  exist(ids: string[]): Promise<Map<string, boolean>>
  stats(id: string): Promise<{ size: number } | undefined>
  size(id: string): Promise<number | undefined>
}

export interface ContentItem {
  contentEncoding(): Promise<ContentEncoding | null>
  getLength(): number | undefined
  asStream(): Promise<Readable>
}
export class SimpleContentItem implements ContentItem {
  constructor(
    private streamCreator: () => Promise<Readable>,
    private length?: number,
    private encoding?: ContentEncoding | null
  ) {}

  static fromBuffer(buffer: Uint8Array): SimpleContentItem {
    return new SimpleContentItem(async () => bufferToStream(buffer), buffer.length, null)
  }

  asStream(): Promise<Readable> {
    return this.streamCreator()
  }

  getLength(): number | undefined {
    return this.length
  }

  async contentEncoding(): Promise<'gzip' | null> {
    return this.encoding ?? null
  }
}

export function bufferToStream(buffer: Uint8Array): Readable {
  return Readable.from(buffer)
}

export function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: any[] = []
    stream.on('error', reject)
    stream.on('data', (data) => buffers.push(data))
    stream.on('end', () => resolve(Buffer.concat(buffers)))
  })
}
