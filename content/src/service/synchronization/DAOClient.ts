import { ContentServer, ServerAddress } from "./ContentServer";
import { ServerName } from "../naming/Naming";
import fetch from "node-fetch";

export class DAOClient {

    private static DAO_ADDRESS = "localhost:3000"

    async registerServerInDAO(name: ServerName, address: ServerAddress): Promise<void> {
        await fetch(`http://${DAOClient.DAO_ADDRESS}/register`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ server: address })
        });
        console.log("Server registered in DAO.");
    }

    async getAllServers(): Promise<ContentServer[]> {
        const response = await fetch(`http://${DAOClient.DAO_ADDRESS}/all-servers`)
        const serverAddresses: any[] = await response.json()
        const servers = serverAddresses.map(async ({ address }) => {
            // TODO: Handle posibility that we can't connect
            const serverName = await this.getServerName(address);
            return new ContentServer(serverName, address);
        });

        return Promise.all(servers)
    }

    private async getServerName(address: ServerAddress): Promise<ServerName> {
        const response = await fetch(`http://${address}/status`)
        const { name } = await response.json()
        return name
    }
}
