import {
  ContentItem,
  ContentStorage,
  SimpleContentItem,
  StorageContent
} from '@katalyst/content/storage/ContentStorage'

export class MockedStorage implements ContentStorage {
  private storage: Map<string, Buffer> = new Map()

  store(id: string, content: StorageContent): Promise<void> {
    this.storage.set(id, content.data)
    return Promise.resolve()
  }
  delete(ids: string[]): Promise<void> {
    ids.forEach((id) => this.storage.delete(id))
    return Promise.resolve()
  }
  retrieve(id: string): Promise<ContentItem | undefined> {
    const content = this.storage.get(id)
    return Promise.resolve(content ? SimpleContentItem.fromBuffer(content) : undefined)
  }
  exist(ids: string[]): Promise<Map<string, boolean>> {
    return Promise.resolve(new Map(ids.map((id) => [id, this.storage.has(id)])))
  }
}
