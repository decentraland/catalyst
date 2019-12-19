import { ServerAddress } from "./ContentServerClient";
import fetch from "node-fetch";

export class DAOClient {

    // TODO: Make this configurable
    private static DAO_ADDRESS = "localhost:3000"

    // TODO: Remove this on final version
    async registerServerInDAO(address: ServerAddress): Promise<void> {
        await fetch(`http://${DAOClient.DAO_ADDRESS}/register`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ server: address })
        });
        console.log("Server registered in DAO.");
    }

    async getAllServers(): Promise<ServerAddress[]> {
        const response = await fetch(`http://${DAOClient.DAO_ADDRESS}/all-servers`)
        const serverAddresses: any[] = await response.json()
        return serverAddresses.map(({ address }) => address)
    }

}
