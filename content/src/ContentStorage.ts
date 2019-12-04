export interface ContentStorage {
    store(category: string, id: string, content: Buffer): Promise<void>;
    getContent(category: string, id: string): Promise<Buffer>;
    listIds(category: string): Promise<string[]>;
    exists(category: string, id: string): Promise<boolean>;
}
