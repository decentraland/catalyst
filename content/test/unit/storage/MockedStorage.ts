import { Readable } from 'stream'
import { ContentItem, ContentStorage, SimpleContentItem, streamToBuffer } from '../../../src/storage/ContentStorage'

export class MockedStorage implements ContentStorage {
  private storage: Map<string, Buffer> = new Map()

  async storeStream(id: string, content: Readable): Promise<void> {
    this.storage.set(id, await streamToBuffer(content))
  }
  async store(id: string, content: Buffer): Promise<void> {
    this.storage.set(id, content)
  }
  async delete(ids: string[]): Promise<void> {
    ids.forEach((id) => this.storage.delete(id))
  }
  async retrieve(id: string): Promise<ContentItem | undefined> {
    const content = this.storage.get(id)
    return content ? SimpleContentItem.fromBuffer(content) : undefined
  }
  async exist(ids: string[]): Promise<Map<string, boolean>> {
    return new Map(ids.map((id) => [id, this.storage.has(id)]))
  }
  async stats(id: string): Promise<{ size: number } | undefined> {
    const content = this.storage.get(id)
    return content ? { size: content.byteLength } : undefined
  }
}
