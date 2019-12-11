import { ContentStorage } from "../../src/storage/ContentStorage";

export class MockedStorage implements ContentStorage {
    store(category: string, id: string, content: Buffer, append?: boolean | undefined): Promise<void> {
      return Promise.resolve()
    }  
    delete(category: string, id: string): Promise<void> {
      return Promise.resolve()
    }
    getContent(category: string, id: string): Promise<Buffer> {
      throw new Error("Method not implemented.");
    }
    listIds(category: string): Promise<string[]> {
      throw new Error("Method not implemented.");
    }
    exists(category: string, id: string): Promise<boolean> {
      throw new Error("Method not implemented.");
    }
}