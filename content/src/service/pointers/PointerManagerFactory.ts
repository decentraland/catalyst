import { Environment } from "../../Environment"
import { PointerManager } from "./PointerManager"

export class PointerManagerFactory {

    static create(env: Environment): PointerManager {
        return new PointerManager()
    }
}
