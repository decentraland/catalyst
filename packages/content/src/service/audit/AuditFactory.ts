import { Environment, Bean } from "../../Environment"
import { AuditStorage } from "./AuditStorage"
import { Audit, AuditManager, AuditOverwrite } from "./Audit"

export class AuditFactory {

    static create(env: Environment): AuditManager & AuditOverwrite {
        const storage: AuditStorage = new AuditStorage(env.getBean(Bean.STORAGE))
        return new Audit(storage)
    }
}
