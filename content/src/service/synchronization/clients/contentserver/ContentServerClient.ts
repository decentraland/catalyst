import fetch from "node-fetch";
import { Timestamp, File, ServerStatus } from "../../../Service";
import { EntityId, EntityType, Entity } from "../../../Entity";
import { DeploymentHistory } from "../../../history/HistoryManager";
import { FileHash } from "../../../Hashing";
import { ServerName } from "../../../naming/NameKeeper";
import { AuditInfo } from "../../../audit/Audit";

export const UNREACHABLE: string = "UNREACHABLE"

export abstract class ContentServerClient {

    constructor(protected readonly name: ServerName,
        protected lastKnownTimestamp: Timestamp) { }

    getNewDeployments(): Promise<DeploymentHistory> {
        return this.getHistory(this.lastKnownTimestamp, this.name)
    }

    getLastKnownTimestamp(): Timestamp {
        return this.lastKnownTimestamp
    }

    getName(): ServerName {
        return this.name
    }

    /** Update the last known timestamp */
    abstract updateTimestamp(timestamp: Timestamp | undefined): Promise<void>;
    /** Return whether the server is actually active. It its not active, then we might use a redirect client for example */
    abstract isActive(): boolean
    abstract getEntity(entityType: EntityType, entityId: EntityId): Promise<Entity>;
    abstract getContentFile(fileHash: FileHash): Promise<File>;
    abstract getAuditInfo(entityType: EntityType, entityId: EntityId): Promise<AuditInfo>;
    abstract getStatus(): Promise<ServerStatus>;
    abstract getHistory(from: number, serverName?: ServerName, to?: Timestamp): Promise<DeploymentHistory>;
}

/** Return the server's name, or the text "UNREACHABLE" it it couldn't be reached */
export async function getServerName(address: ServerAddress): Promise<ServerName> {
    return fetch(`http://${address}/status`)
        .then(response => response.json())
        .then(({ name }) => name)
        .catch(() => UNREACHABLE)
}

export type ServerAddress = string
