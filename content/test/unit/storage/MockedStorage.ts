import { ContentStorage } from "@katalyst/content/storage/ContentStorage";

export class MockedStorage implements ContentStorage {

    private storage: Map<string, Buffer> = new Map()

    store(category: string, id: string, content: Buffer, append?: boolean): Promise<void> {
        const key = this.getKey(category, id)
        if (append) {
            const alreadyStoredContent: Buffer | undefined = this.storage.get(key)
            if (alreadyStoredContent) {
                this.storage.set(key, Buffer.concat([alreadyStoredContent, content]))
            } else {
                this.storage.set(key, content)
            }
        } else {
            this.storage.set(key, content)
        }
        return Promise.resolve()
    }
    delete(category: string, id: string): Promise<void> {
        this.storage.delete(this.getKey(category, id))
        return Promise.resolve()
    }
    getContent(category: string, id: string): Promise<Buffer | undefined> {
        return Promise.resolve(this.storage.get(this.getKey(category, id)))
    }
    listIds(category: string): Promise<string[]> {
        const ids = Array.from(this.storage.keys())
            .map((key) => key.split("___"))
            .filter(([cat, ]) => cat == category)
            .map(([, id]) => id)
        return Promise.resolve(ids)
    }
    exists(category: string, id: string): Promise<boolean> {
      return Promise.resolve(this.storage.has(this.getKey(category, id)))
    }

    private getKey(category: string, id: string): string {
        return `${category}___${id}`
    }
}