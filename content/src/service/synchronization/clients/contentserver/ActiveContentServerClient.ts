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
import { FetchHelper } from "@katalyst/content/helpers/FetchHelper";
import { HistoryClient } from "@katalyst/content/service/history/client/HistoryClient";

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
        const json = await FetchHelper.fetchJson(`${this.address}/entities/${entityType}?id=${entityId}`)
        const entity = json[0];
        return EntityFactory.fromJsonObject(entity);
    }

    getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<AuditInfo> {
        return FetchHelper.fetchJson(`${this.address}/audit/${entityType}/${entityId}`)
    }

    getStatus(): Promise<ServerStatus> {
        return FetchHelper.fetchJson(`${this.address}/status`)
    }

    async getHistory(from: Timestamp, serverName?: ServerName, to?: Timestamp): Promise<DeploymentHistory> {
        return HistoryClient.consumeAllHistory(this.address, from, to, serverName)
    }

    isActive(): boolean {
        return true
    }

    async getContentFile(fileHash: ContentFileHash): Promise<ContentFile> {
        let retries = 2
        let content: Buffer | undefined = undefined

        while (retries >= 0) {
            try {
                content = await FetchHelper.fetchBuffer(`${this.address}/contents/${fileHash}`);
                const downloadedHash = await Hashing.calculateBufferHash(content)
                if (downloadedHash == fileHash) {
                    break;
                }
            } catch (error) {
                await sleep(ms("0.5s"))
                retries--;
            }
        }
        if (retries >=0 && content) {
            return { name: fileHash, content: content }
        }
        throw new Error(`Failed to fetch file with hash ${fileHash}`)
    }

    private async getCurrentTimestamp(): Promise<Timestamp> {
        const { currentTime } = await FetchHelper.fetchJson(`${this.address}/status`)
        return currentTime;
    }
}