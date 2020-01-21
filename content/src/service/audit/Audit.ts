import { Timestamp } from "../time/TimeSorting";
import { EntityId } from "../Entity";
import { AuditStorage } from "./AuditStorage";
import { AuthChain } from "../auth/Authenticator";
import { ContentFileHash } from "../Hashing";

export const NO_TIMESTAMP: Timestamp = -1

export interface AuditOverwrite {
    setEntityAsOverwritten(id: EntityId, overwrittenBy: EntityId): Promise<void>
}

export interface AuditManager {
    getAuditInfo(id: EntityId): Promise<AuditInfo | undefined>;
    setAuditInfo(id: EntityId, info: AuditInfo): Promise<void>;
}

export class Audit implements AuditOverwrite, AuditManager {

    constructor(private storage: AuditStorage) {}

    getAuditInfo(id: string): Promise<AuditInfo | undefined> {
        return this.storage.getAuditInfo(id)
    }

    setAuditInfo(id: string, info: AuditInfo): Promise<void> {
        return this.storage.storeAuditInfo(id, info)
    }

    async setEntityAsOverwritten(id: string, overwrittenBy: string): Promise<void> {
        const auditInfo = await this.storage.getAuditInfo(id);
        if (auditInfo) {
            auditInfo.overwrittenBy = overwrittenBy
            await this.storage.storeAuditInfo(id, auditInfo)
        }
    }

}

export type AuditInfo = {
    version: EntityVersion,
    deployedTimestamp: Timestamp

    authChain: AuthChain,

    overwrittenBy?: EntityId,

    isBlacklisted?: boolean,
    blacklistedContent?: ContentFileHash[],

    originalMetadata?: { // This is used for migrations
        originalVersion: EntityVersion,
        data: any,
    },
}

export enum EntityVersion {
    V2 = "v2",
    V3 = "v3"
}

