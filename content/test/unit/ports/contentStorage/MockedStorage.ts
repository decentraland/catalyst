import { ContentItem, IContentStorageComponent } from '@dcl/catalyst-storage'
import { Readable } from 'stream'
import { streamToBuffer, SimpleContentItem } from '@dcl/catalyst-storage/dist/content-item'

export class MockedStorage implements IContentStorageComponent {
  private storage: Map<string, Uint8Array> = new Map()

  async storeStreamAndCompress(fileId: string, content: Readable): Promise<void> {
    this.storage.set(fileId, await streamToBuffer(content))
  }
  async exist(fileId: string): Promise<boolean> {
    return this.storage.has(fileId)
  }
  async storeStream(fileId: string, content: Readable): Promise<void> {
    this.storage.set(fileId, await streamToBuffer(content))
  }
  async delete(ids: string[]): Promise<void> {
    ids.forEach((id) => this.storage.delete(id))
  }
  async retrieve(fileId: string): Promise<ContentItem | undefined> {
    const content = this.storage.get(fileId)
    return content ? SimpleContentItem.fromBuffer(content) : undefined
  }
  async existMultiple(fileIds: string[]): Promise<Map<string, boolean>> {
    return new Map(fileIds.map((fileId) => [fileId, this.storage.has(fileId)]))
  }
  allFileIds(): AsyncIterable<string> {
    throw new Error('Method not implemented.')
  }
}
