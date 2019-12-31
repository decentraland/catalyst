import fetch from "node-fetch";
import ms from "ms";
import { Timestamp, File, ServerStatus } from "../../../Service";
import { EntityId, EntityType, Entity } from "../../../Entity";
import { DeploymentHistory } from "../../../history/HistoryManager";
import { FileHash } from "../../../Hashing";
import { ServerName } from "../../../naming/NameKeeper";
import { EntityFactory } from "../../../EntityFactory";
import { AuditInfo } from "../../../audit/Audit";
import { ContentServerClient, ServerAddress } from "./ContentServerClient";

export function getClient(address: ServerAddress, name: ServerName, lastKnownTimestamp: Timestamp): ActiveContentServerClient {
    return new ActiveContentServerClient(address, name, lastKnownTimestamp)
}

class ActiveContentServerClient extends ContentServerClient {

    constructor(private readonly address: ServerAddress,
        name: ServerName, lastKnownTimestamp: Timestamp) {
            super(name, lastKnownTimestamp)
        }

    /**
     * After entities have been successfully deployed, we can update the last known timestamp.
     * If there were no entities to be deployed, then we ask the server for its current time
     */
    async updateTimestamp(timestamp: number | undefined): Promise<void> {
        // If not set, then ask the server's for its current time
        timestamp = timestamp ?? (await this.getCurrentTimestamp()) - ms('1m') // Subtract 1 min, as to avoid potential race conditions with a new deployment

        // Update the last known timestamp
        this.lastKnownTimestamp = Math.max(this.lastKnownTimestamp, timestamp);
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

    async getStatus(): Promise<ServerStatus> {
        const response = await fetch(`http://${this.address}/status`)
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

    async getHistory(from: number, serverName?: ServerName, to?: Timestamp): Promise<DeploymentHistory> {
        let url = `http://${this.address}/history?from=${from}`
        if (to) {
            url += `&to=${to}`
        }
        if (serverName) {
            url += `&serverName=${serverName}`
        }
        const response = await fetch(url)
        return response.json();
    }

    isActive(): boolean {
        return true
    }

    private async getCurrentTimestamp(): Promise<Timestamp> {
        const response = await fetch(`http://${this.address}/status`);
        const { currentTime } = await response.json();
        return currentTime;
    }
}