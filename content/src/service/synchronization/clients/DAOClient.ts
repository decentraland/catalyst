import { ServerAddress } from "./contentserver/ContentServerClient";
import fetch from "node-fetch";

export class DAOClient {

    constructor(private readonly daoAddress: string) { }

    // TODO: Remove this on final version
    async registerServerInDAO(address: ServerAddress): Promise<void> {
        const result = await fetch(`${this.daoAddress}/register`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ server: address })
        });
        if (result.ok) {
            console.log(`Server registered in DAO. Address is ${address}`);
        } else {
            throw new Error(`Couldn't connect to the DAO. Error: ${result.statusText}`)
        }
    }

    async getAllServers(): Promise<Set<ServerAddress>> {
        const response = await fetch(`${this.daoAddress}/servers`)
        const serverAddresses: any[] = await response.json()
        return new Set(serverAddresses.map(({ address }) => address))
    }

}
