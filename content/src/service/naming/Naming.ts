import { NamingStorage } from "./NamingStorage";
import uuidv4 from "uuid/v4"


export class Naming {

    private constructor(private serverName: ServerName) { }

    static async build(storage: NamingStorage): Promise<Naming>{
        return new Naming(await Naming.getOrCreateServerName(storage))

    }

    getServerName(): ServerName {
        return this.serverName
    }

    private static async getOrCreateServerName(storage: NamingStorage): Promise<ServerName> {
        const storedName: ServerName | undefined = await storage.getName()
        if (!storedName) {
            const newName = uuidv4();
            await storage.setName(newName)
            return newName
        } else {
            return storedName
        }
    }

}

export type ServerName = string