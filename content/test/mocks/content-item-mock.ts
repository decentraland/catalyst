import { ContentItem } from '@dcl/catalyst-storage'
import { Readable } from 'stream'

export const createContentItemMock = (size: number | null = 100, encoding: string | null = null): ContentItem => {
  return {
    size,
    encoding,
    contentSize: size,
    asStream: jest.fn().mockResolvedValue(Readable.from(Buffer.alloc(size ?? 0))),
    asRawStream: jest.fn().mockResolvedValue(Readable.from(Buffer.alloc(size ?? 0)))
  }
}
