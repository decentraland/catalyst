import { ServerAddress, ServerName, Timestamp, EntityType, EntityId, ServerStatus, LegacyDeploymentHistory, ContentFileHash, ContentFile, Fetcher } from "dcl-catalyst-commons";
import { ContentClient } from "dcl-catalyst-client";
import { Entity } from "../../../Entity";
import { EntityFactory } from "../../../EntityFactory";
import { LegacyAuditInfo, EntityVersion } from "../../../Audit";
import { ContentServerClient, ConnectionState } from "./ContentServerClient";

export function getClient(fetcher: Fetcher, address: ServerAddress, requestTtlBackwards: number, name: ServerName, lastKnownTimestamp: Timestamp): ActiveContentServerClient {
    return new ActiveContentServerClient(requestTtlBackwards, fetcher, address, name, lastKnownTimestamp)
}

class ActiveContentServerClient extends ContentServerClient {

    private readonly client: ContentClient

    constructor(
        private readonly requestTtlBackwards: number,
        fetcher: Fetcher,
        address: ServerAddress,
        name: ServerName,
        estimatedLocalImmutableTime: Timestamp) {
            super(name, estimatedLocalImmutableTime)
            this.client = new ContentClient(address, '', fetcher)
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
        const entity = this.client.fetchEntityById(entityType, entityId)
        return EntityFactory.fromJsonObject(entity);
    }

    async getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<LegacyAuditInfo> {
        const auditInfo = await this.client.fetchAuditInfo(entityType, entityId)
        return {
            ...auditInfo,
            version: EntityVersion[auditInfo.version.toUpperCase()],
            deployedTimestamp: auditInfo.originTimestamp,
        }
    }

    getStatus(): Promise<ServerStatus> {
        return this.client.fetchStatus()
    }

    getHistory(from: Timestamp, serverName?: ServerName, to?: Timestamp): Promise<LegacyDeploymentHistory> {
        return this.client.fetchFullHistory({ from, to, serverName })
    }

    getConnectionState(): ConnectionState {
        return ConnectionState.CONNECTED;
    }

    async getContentFile(fileHash: ContentFileHash): Promise<ContentFile> {
        const content = await this.client.downloadContent(fileHash, { attempts: 3, waitTime: '0.5s' })
        return { name: fileHash, content }
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