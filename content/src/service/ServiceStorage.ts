import { ContentFileHash } from 'dcl-catalyst-commons'
import { ContentItem, ContentStorage } from '../storage/ContentStorage'

export class ServiceStorage {
  constructor(private storage: ContentStorage) {}

  storeContent(fileHash: ContentFileHash, content: Uint8Array): Promise<void> {
    return this.storage.store(fileHash, content)
  }

  getContent(fileHash: ContentFileHash): Promise<ContentItem | undefined> {
    return this.storage.retrieve(fileHash)
  }

  deleteContent(fileHashes: ContentFileHash[]): Promise<void> {
    return this.storage.delete(fileHashes)
  }

  async isContentAvailable(fileHashes: ContentFileHash[]): Promise<Map<ContentFileHash, boolean>> {
    return this.storage.exist(fileHashes)
  }

  async getSize(fileHash: ContentFileHash): Promise<number | undefined> {
    return (await this.storage.stats(fileHash))?.size
  }
}
