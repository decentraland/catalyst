import { NamingStorage } from "./NamingStorage";
import v4 from 'uuid/v4';

export class NameKeeper {

    private constructor(private serverName: ServerName) { }

    static async build(storage: NamingStorage, prefix: string): Promise<NameKeeper>{
        return new NameKeeper(await NameKeeper.getOrCreateServerName(storage, prefix))
    }

    getServerName(): ServerName {
        return this.serverName
    }

    private static async getOrCreateServerName(storage: NamingStorage, prefix: string): Promise<ServerName> {
        const storedName: ServerName | undefined = await storage.getName()
        if (!storedName) {
            const newName = (prefix ?? '') + v4();
            await storage.setName(newName)
            return newName
        } else {
            return storedName
        }
    }

}

export type ServerName = string