import { ContentFile, ServerStatus } from "../../../Service";
import { Timestamp } from "../../../time/TimeSorting";
import { EntityId, EntityType, Entity } from "../../../Entity";
import { DeploymentHistory } from "../../../history/HistoryManager";
import { ContentFileHash, Hashing } from "../../../Hashing";
import { ServerName } from "../../../naming/NameKeeper";
import { EntityFactory } from "../../../EntityFactory";
import { AuditInfo } from "../../../audit/Audit";
import { ContentServerClient, ServerAddress, ConnectionState } from "./ContentServerClient";
import { FetchHelper, retry } from "@katalyst/content/helpers/FetchHelper";
import { HistoryClient } from "@katalyst/content/service/history/client/HistoryClient";

export function getClient(fetchHelper: FetchHelper, address: ServerAddress, requestTtlBackwards: number, name: ServerName, lastKnownTimestamp: Timestamp): ActiveContentServerClient {
    return new ActiveContentServerClient(fetchHelper, address, requestTtlBackwards, name, lastKnownTimestamp)
}

class ActiveContentServerClient extends ContentServerClient {

    constructor(private readonly fetchHelper: FetchHelper,
        private readonly address: ServerAddress,
        private readonly requestTtlBackwards: number,
        name: ServerName,
        estimatedLocalImmutableTime: Timestamp) {
            super(name, estimatedLocalImmutableTime)
        }

    /**
     * After entities have been successfully deployed, we can update the estimated immutable time.
     * If there were no entities to be deployed, then we ask the server for its current time
     */
    async updateEstimatedLocalImmutableTime(timestamp: number | undefined): Promise<void> {
        // If not set, then ask the server's for its current time
        timestamp = timestamp ?? (await this.getCurrentTimestamp()) - this.requestTtlBackwards // Subtract allowed TTL, as to avoid potential race conditions with a new deployment

        // Update the estimated immutable time
        this.estimatedLocalImmutableTime = Math.max(this.estimatedLocalImmutableTime, timestamp);
    }

    async getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity> {
        const json = await this.fetchHelper.fetchJson(`${this.address}/entities/${entityType}?id=${entityId}`)
        const entity = json[0];
        return EntityFactory.fromJsonObject(entity);
    }

    getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<AuditInfo> {
        return this.fetchHelper.fetchJson(`${this.address}/audit/${entityType}/${entityId}`)
    }

    getStatus(): Promise<ServerStatus> {
        return this.fetchHelper.fetchJson(`${this.address}/status`)
    }

    async getHistory(from: Timestamp, serverName?: ServerName, to?: Timestamp): Promise<DeploymentHistory> {
        return HistoryClient.consumeAllHistory(this.fetchHelper, this.address, from, to, serverName)
    }

    getConnectionState(): ConnectionState {
        return ConnectionState.CONNECTED;
    }

    async getContentFile(fileHash: ContentFileHash): Promise<ContentFile> {
        return retry(async () => {
            const content = await this.fetchHelper.fetchBuffer(`${this.address}/contents/${fileHash}`);
            const downloadedHash = await Hashing.calculateBufferHash(content)
            if (downloadedHash === fileHash) {
                return { name: fileHash, content: content }
            }
            throw new Error(`Failed to fetch file with hash ${fileHash} from ${this.address}`)
        }, 3, `get file with hash ${fileHash}`, '0.5s')
    }

    /**
     * Check the current time on the status and report it. However, if the name is not as expected, then
     * we shouldn't update the estimated immutable time. On the next DAO sync, the name will be updated correctly
     */
    private async getCurrentTimestamp(): Promise<Timestamp> {
        const { currentTime, name } = await this.getStatus()
        if (name === this.getName()) {
            return currentTime;
        } else {
            return -1
        }
    }
}