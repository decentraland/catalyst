import fetch from "node-fetch";
import ms from "ms";
import { ContentFile, ServerStatus } from "../../../Service";
import { Timestamp } from "../../../time/TimeSorting";
import { EntityId, EntityType, Entity } from "../../../Entity";
import { DeploymentHistory } from "../../../history/HistoryManager";
import { ContentFileHash, Hashing } from "../../../Hashing";
import { ServerName } from "../../../naming/NameKeeper";
import { EntityFactory } from "../../../EntityFactory";
import { AuditInfo } from "../../../audit/Audit";
import { ContentServerClient, ServerAddress } from "./ContentServerClient";
import { sleep } from "../../ClusterUtils";

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
        const json = await this.fetchJson(`${this.address}/entities/${entityType}?id=${entityId}`)
        const entity = json[0];
        return EntityFactory.fromJsonObject(entity);
    }

    getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<AuditInfo> {
        return this.fetchJson(`${this.address}/audit/${entityType}/${entityId}`)
    }

    getStatus(): Promise<ServerStatus> {
        return this.fetchJson(`${this.address}/status`)
    }

    getHistory(from: number, serverName?: ServerName, to?: Timestamp): Promise<DeploymentHistory> {
        let url = `${this.address}/history?from=${from}`
        if (to) {
            url += `&to=${to}`
        }
        if (serverName) {
            url += `&serverName=${serverName}`
        }
        return this.fetchJson(url)
    }

    isActive(): boolean {
        return true
    }

    async getContentFile(fileHash: ContentFileHash): Promise<ContentFile> {
        let retries = 3
        let content: Buffer | undefined = undefined

        while (retries >= 0) {
            const response = await fetch(`${this.address}/contents/${fileHash}`);
            if (response.ok) {
                content = await response.buffer();
                const downloadedHash = await Hashing.calculateBufferHash(content)
                if (downloadedHash == fileHash) {
                    break;
                }
            }
            await sleep(ms("1s"))
            retries--;
        }
        if (retries >=0 && content) {
            return { name: fileHash, content: content }
        } else {
            throw new Error(`Failed to fetch file with hash ${fileHash}`)
        }
    }

    private async fetchJson(url: string): Promise<any> {
        const response = await fetch(url);
        if (response.ok) {
            return response.json()
        } else {
            throw new Error(`Failed to fetch ${url}. Got status ${response.status}, ${response.statusText}`)
        }
    }

    private async getCurrentTimestamp(): Promise<Timestamp> {
        const { currentTime } = await this.fetchJson(`${this.address}/status`)
        return currentTime;
    }
}