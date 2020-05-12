import { Environment, Bean } from "../../Environment"
import { PointerManager } from "./PointerManager"

export class PointerManagerFactory {

    static create(env: Environment): PointerManager {
        return new PointerManager(env.getBean(Bean.CACHE_MANAGER))
    }
}
