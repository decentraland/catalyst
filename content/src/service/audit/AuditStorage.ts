import { ContentStorage } from "../../../src/storage/ContentStorage";
import { EntityId } from "../Entity";
import { AuditInfo } from "./Audit";

export class AuditStorage {

    private static PROOF_CATEGORY = "proofs"

    constructor(private storage: ContentStorage) { }

    storeAuditInfo(entityId: EntityId, auditInfo: AuditInfo): Promise<void> {
       return this.storage.store(AuditStorage.PROOF_CATEGORY, entityId, Buffer.from(JSON.stringify(auditInfo)))
    }

    getAuditInfo(id: EntityId): Promise<AuditInfo | undefined> {
        try {
            return this.storage.getContent(AuditStorage.PROOF_CATEGORY, id)
                .then(buffer => JSON.parse(buffer.toString()))
        } catch (error) {
            return Promise.resolve(undefined)
        }
    }

}