import { Readable } from 'stream'
import { ContentItem, ContentStorage, SimpleContentItem, streamToBuffer } from '../../../src/storage/ContentStorage'

export class MockedStorage implements ContentStorage {
  private storage: Map<string, Uint8Array> = new Map()

  async exist(fileId: string): Promise<boolean> {
    return this.storage.has(fileId)
  }
  async storeStream(id: string, content: Readable): Promise<void> {
    this.storage.set(id, await streamToBuffer(content))
  }
  async delete(ids: string[]): Promise<void> {
    ids.forEach((id) => this.storage.delete(id))
  }
  async retrieve(id: string): Promise<ContentItem | undefined> {
    const content = this.storage.get(id)
    return content ? SimpleContentItem.fromBuffer(content) : undefined
  }
  async existMultiple(ids: string[]): Promise<Map<string, boolean>> {
    return new Map(ids.map((id) => [id, this.storage.has(id)]))
  }
}
