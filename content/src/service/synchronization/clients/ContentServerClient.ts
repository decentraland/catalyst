import fetch from "node-fetch";
import { Timestamp, File, AuditInfo } from "../../Service";
import { EntityId, EntityType, Entity } from "../../Entity";
import { DeploymentHistory } from "../../history/HistoryManager";
import { FileHash } from "../../Hashing";
import { ServerName } from "../../naming/NameKeeper";
import { EntityFactory } from "../../EntityFactory";

export const UNREACHABLE: string = "UNREACHABLE"

export interface ContentServerClient {

    getNewDeployments(): Promise<DeploymentHistory>;
    getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity>;
    getContentFile(fileHash: FileHash): Promise<File>;
    getLastKnownTimestamp(): Timestamp;
    getName(): ServerName;
    getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<AuditInfo>;

}

/** Return the server's name, or the text "UNREACHABLE" it it couldn't be reached */
export async function getServerName(address: ServerAddress): Promise<ServerName> {
    return fetch(`http://${address}/status`)
        .then(response => response.json())
        .then(({ name }) => name)
        .catch(() => UNREACHABLE)
}

export function getClient(name: ServerName, address: ServerAddress, lastKnownTimestamp: Timestamp): ContentServerClient {
    return new ReachableContentServerClient(name, address, lastKnownTimestamp)
}

export function getUnreachableClient(): ContentServerClient {
    return new UnreachableContentServerClient()
}

class ReachableContentServerClient implements ContentServerClient {
    private static readonly ONE_MINUTE = 60 * 1000; // One minute in milliseconds

    constructor(private readonly name: ServerName,
        private readonly address: ServerAddress,
        private lastKnownTimestamp: Timestamp) { }

    async getNewDeployments(): Promise<DeploymentHistory> {
        // Get new deployments
        const newDeployments: DeploymentHistory = await this.getDeploymentHistory();
        if (newDeployments.length == 0) {
            // If there are no new deployments, then update the timestamp with a new call
            const newTimestamp: Timestamp = await this.getCurrentTimestamp() - ReachableContentServerClient.ONE_MINUTE; // Substract 1 min, as to avoid potential race conditions with a new deployment

            // Keep the latest timestamp, since we don't want to go back in time
            this.lastKnownTimestamp = Math.max(this.lastKnownTimestamp, newTimestamp);
        }
        else {
            // Update the new timestamp with the latest deployment
            this.lastKnownTimestamp = Math.max(this.lastKnownTimestamp, ...newDeployments.map(deployment => deployment.timestamp + 1))
        }
        return newDeployments;
    }

    async getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity> {
        const response = await fetch(`http://${this.address}/entities/${entityType}?id=${entityId}`);
        const json = await response.json();
        const entity = json[0];
        return EntityFactory.fromJsonObject(entity);
    }

    async getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<AuditInfo> {
        const response = await fetch(`http://${this.address}/audit/${entityType}/${entityId}`)
        return response.json();
    }

    async getContentFile(fileHash: FileHash): Promise<File> {
        const response = await fetch(`http://${this.address}/contents/${fileHash}`);
        const content = await response.buffer();
        return {
            name: fileHash,
            content: content
        };
    }

    getLastKnownTimestamp(): Timestamp {
        return this.lastKnownTimestamp
    }

    getName(): ServerName {
        return this.name
    }

    private async getDeploymentHistory(): Promise<DeploymentHistory> {
        console.log(`Checking history of node '${this.name}' with timestamp '${this.lastKnownTimestamp}'`)
        const response = await fetch(`http://${this.address}/history?from=${this.lastKnownTimestamp}&serverName=${this.name}`);
        return await response.json();
    }

    private async getCurrentTimestamp(): Promise<Timestamp> {
        const response = await fetch(`http://${this.address}/status`);
        const { currentTime } = await response.json();
        return currentTime;
    }
}

class UnreachableContentServerClient implements ContentServerClient {

    getAuditInfo(entityId: string): Promise<AuditInfo> {
        throw new Error("Content server is unreachable.");
    }

    getNewDeployments(): Promise<DeploymentHistory> {
        return Promise.resolve([])
    }

    getEntity(entityType: EntityType, entityId: string): Promise<Entity> {
        throw new Error("Content server is unreachable.");
    }

    getContentFile(fileHash: string): Promise<File> {
        throw new Error("Content server is unreachable.");
    }

    getLastKnownTimestamp(): Timestamp {
        return -1
    }

    getName(): ServerName {
        return UNREACHABLE
    }

}

export type ServerAddress = string
