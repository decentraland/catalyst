import { Timestamp } from "../Service";
import { EntityId } from "../Entity";
import { AuditStorage } from "./AuditStorage";
import { EthAddress, Signature } from "../auth/Authenticator";

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
    deployedTimestamp: Timestamp
    ethAddress: EthAddress
    signature: Signature,
    overwrittenBy?: EntityId
}