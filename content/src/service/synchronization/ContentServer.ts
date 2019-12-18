import { Timestamp, File, ServerStatus } from "../Service";
import { EntityId, EntityType, Entity } from "../Entity";
import { DeploymentHistory } from "../history/HistoryManager";
import { FileHash } from "../Hashing";
import { ServerName } from "../naming/Naming";
import fetch from "node-fetch";
import { EntityFactory } from "../EntityFactory";

export class ContentServer {
    private static readonly ONE_MINUTE = 60 * 1000; // One minute in milliseconds
    lastKnownTimestamp: Timestamp;
    constructor(public name: ServerName, public address: ServerAddress) {
        this.lastKnownTimestamp = 0;
    }
    async getNewDeployments(): Promise<DeploymentHistory> {
        // Get new deployments
        const newDeployments: DeploymentHistory = await this.getDeploymentHistory();
        if (newDeployments.length == 0) {
            // If there are no new deployments, then update the timestamp with a new call
            const newTimestamp: Timestamp = await this.getCurrentTimestamp() - ContentServer.ONE_MINUTE; // Substract 1 min, as to avoid potential race conditions with a new deployment
            // Keep the latest timestamp, since we don't want to go back in time
            this.lastKnownTimestamp = Math.max(newTimestamp, this.lastKnownTimestamp);
        }
        else {
            // Update the new timestamp with the latest deployment
            this.lastKnownTimestamp = Math.max(this.lastKnownTimestamp, ...newDeployments.map(deployment => deployment.timestamp));
        }
        return newDeployments;
    }
    getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity> {
        return fetch(`http://${this.address}/entities/${entityType}?id=${entityId}`)
            .then(response => response.json())
            .then(response => response[0])
            .then(entityJson => EntityFactory.fromJsonObject(entityJson))
    }
    getContentFile(fileHash: FileHash): Promise<File> {
        return fetch(`http://${this.address}/contents/${fileHash}`)
            .then(response => response.buffer())
            .then((content: Buffer) => {
                return {
                    name: fileHash,
                    content: content
                };
            });
    }
    private getDeploymentHistory(): Promise<DeploymentHistory> {
        return fetch(`http://${this.address}/history?from=${this.lastKnownTimestamp}&serverName=${this.name}`)
            .then(response => response.json());
    }
    private getCurrentTimestamp(): Promise<Timestamp> {
        return fetch(`http://${this.address}/status`)
            .then(response => response.json())
            .then((serverStatus: ServerStatus) => serverStatus.currentTime);
    }
}

export type ServerAddress = string
