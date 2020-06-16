import { AuthChain } from "dcl-crypto";
import { ContentFileHash, Timestamp, EntityId, ServerAddress } from "dcl-catalyst-commons";

export type LegacyAuditInfo = {
    version: EntityVersion,
    deployedTimestamp: Timestamp,
    authChain: AuthChain,
    overwrittenBy?: EntityId,
    isDenylisted?: boolean,
    denylistedContent?: ContentFileHash[],
    originalMetadata?: { // This is used for migrations
        originalVersion: EntityVersion,
        data: any,
    },
}

export type AuditInfoBase = {
    version: EntityVersion,
    authChain: AuthChain,
    originalMetadata?: { // This is used for migrations
        originalVersion: EntityVersion,
        data: any,
    },
}

export type AuditInfoExternal = AuditInfoBase & {
    overwrittenBy?: EntityId,
    originTimestamp: Timestamp,
    originServerUrl: ServerAddress,
    isDenylisted?: boolean,
    denylistedContent?: ContentFileHash[],
    deployedTimestamp?: Timestamp, // Here for backwards compatibility. Is the same as originTimestamp
}

export type AuditInfo = AuditInfoExternal & {
    localTimestamp: Timestamp,
}


export enum EntityVersion {
    V2 = "v2",
    V3 = "v3"
}

