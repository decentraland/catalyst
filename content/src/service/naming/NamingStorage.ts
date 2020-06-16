import { ServerName } from "dcl-catalyst-commons";
import { NamingContentStorage } from "./NamingContentStorage";

export class NamingStorage {

    private static readonly NAMING_CATEGORY: string = "naming"
    private static readonly NAMING_ID: string = "name.txt"

    constructor(private storage: NamingContentStorage) { }

    async getName(): Promise<ServerName | undefined> {
        const contentItem = await this.storage.getContent(NamingStorage.NAMING_CATEGORY, NamingStorage.NAMING_ID)
        if (contentItem) {
            return (await contentItem.asBuffer()).toString()
        }
        return undefined
    }

    setName(name: ServerName): Promise<void> {
        return this.storage.store(NamingStorage.NAMING_CATEGORY, NamingStorage.NAMING_ID, Buffer.from(name))
    }

}