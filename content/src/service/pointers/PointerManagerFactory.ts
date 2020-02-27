import { Environment, Bean } from "../../Environment"
import { PointerManager } from "./PointerManager"
import { PointerStorage } from "./PointerStorage"

export class PointerManagerFactory {

    static create(env: Environment): PointerManager {
        const storage: PointerStorage = new PointerStorage(env.getBean(Bean.STORAGE))
        return new PointerManager(storage, env.getBean(Bean.AUDIT), env.getBean(Bean.CACHE_MANAGER))
    }
}
