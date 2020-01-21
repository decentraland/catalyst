import { Timestamp } from "../time/TimeSorting";
import { EntityId } from "../Entity";
import { AuditStorage } from "./AuditStorage";
import { EthAddress, Signature } from "../auth/Authenticator";
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

export type AuthChain = AuthLink[];

export type AuthLink = {
    type: AuthLinkType,
    payload: string,
    signature: Signature,
}

export enum AuthLinkType {
    SIGNER = 'SIGNER',
    ECDSA_EPHEMERAL = 'ECDSA_EPHEMERAL',
    ECDSA_SIGNED_ENTITY = 'ECDSA_SIGNED_ENTITY',
}

export enum EntityVersion {
    V2 = "v2",
    V3 = "v3"
}

export function ownerAddress(auditInfo: AuditInfo): EthAddress {
    if (auditInfo.authChain.length > 0) {
        if (auditInfo.authChain[0].type === AuthLinkType.SIGNER) {
            return auditInfo.authChain[0].payload;
        }
    }
    return 'Invalid-Owner-Address'
}

export function createSimpleAuthChain(finalPayload: string, ownerAddress: EthAddress, signature: Signature): AuthChain {
    return [
        {
            type: AuthLinkType.SIGNER,
            payload: ownerAddress,
            signature: '',
        },{
            type: AuthLinkType.ECDSA_SIGNED_ENTITY,
            payload: finalPayload,
            signature: signature,
        }
    ]
}

// export function createEphemeralAuthChain(finalPayload: string, ownerAddress: EthAddress, signature: Signature): AuthChain {
//     return [
//         {
//             type: AuthLinkType.SIGNER,
//             payload: ownerAddress,
//             signature: '',
//         },{
//             type: AuthLinkType.ECDSA_SIGNED_ENTITY,
//             payload: finalPayload,
//             signature: signature,
//         }
//     ]
// }
