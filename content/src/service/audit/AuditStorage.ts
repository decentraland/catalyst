import { ContentStorage } from "../../storage/ContentStorage";
import { EntityId } from "../Entity";
import { AuditInfo } from "./Audit";

export class AuditStorage {

    private static PROOF_CATEGORY = "proofs"

    constructor(private storage: ContentStorage) { }

    storeAuditInfo(entityId: EntityId, auditInfo: AuditInfo): Promise<void> {
       return this.storage.store(AuditStorage.PROOF_CATEGORY, entityId, Buffer.from(JSON.stringify(auditInfo)))
    }

    async getAuditInfo(id: EntityId): Promise<AuditInfo | undefined> {
        const buffer = await this.storage.getContent(AuditStorage.PROOF_CATEGORY, id)
        if (buffer) {
            return JSON.parse(buffer.toString())
        } else {
            return undefined
        }
    }

}