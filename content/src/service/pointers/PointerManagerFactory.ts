import { Environment, Bean } from "../../Environment"
import { PointerManager } from "./PointerManager"
import { PointerStorage } from "./PointerStorage"

export class PointerManagerFactory {

    static create(env: Environment): Promise<PointerManager> {
        const storage: PointerStorage = new PointerStorage(env.getBean(Bean.STORAGE))
        return PointerManager.build(storage, env.getBean(Bean.AUDIT))
    }
}
