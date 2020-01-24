export interface ContentStorage {
    store(category: string, id: string, content: Buffer, append?: boolean): Promise<void>;
    delete(category: string, id: string): Promise<void>;
    getContent(category: string, id: string): Promise<Buffer | undefined>;
    listIds(category: string): Promise<string[]>;
    exists(category: string, id: string): Promise<boolean>;
}
