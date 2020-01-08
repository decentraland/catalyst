import { ServerAddress } from "./contentserver/ContentServerClient";
import fetch from "node-fetch";

export class DAOClient {

    constructor(private readonly daoAddress: string) { }

    // TODO: Remove this on final version
    async registerServerInDAO(address: ServerAddress): Promise<void> {
        await fetch(`http://${this.daoAddress}/register`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ server: address })
        });
        console.log("Server registered in DAO.");
    }

    async getAllServers(): Promise<Set<ServerAddress>> {
        const response = await fetch(`http://${this.daoAddress}/all-servers`)
        const serverAddresses: any[] = await response.json()
        return new Set(serverAddresses.map(({ address }) => address))
    }

}
