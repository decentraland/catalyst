import { NamingStorage } from "./NamingStorage";
import { v4 as uuid } from 'uuid';

export class NameKeeper {

    // TODO: Make this private in release
    constructor(private serverName: ServerName) { }

    static async build(storage: NamingStorage): Promise<NameKeeper>{
        return new NameKeeper(await NameKeeper.getOrCreateServerName(storage))
    }

    getServerName(): ServerName {
        return this.serverName
    }

    private static async getOrCreateServerName(storage: NamingStorage): Promise<ServerName> {
        const storedName: ServerName | undefined = await storage.getName()
        if (!storedName) {
            const newName = uuid();
            await storage.setName(newName)
            return newName
        } else {
            return storedName
        }
    }

}

export type ServerName = string