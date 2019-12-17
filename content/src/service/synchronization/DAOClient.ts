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

    getAllServers(): Promise<ContentServer[]> {
        // We need to:
        // 1. Ask the DAO for the servers
        // 2. Ask each server for their name
        // DON'T UPDATE THE LATEST TIMESTAMP, we will do it after
        return Promise.resolve([]);
    }
}
