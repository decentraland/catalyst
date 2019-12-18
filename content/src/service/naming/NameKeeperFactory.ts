import { Environment, Bean } from "../../Environment"
import { NamingStorage } from "./NamingStorage"
import { NameKeeper } from "./NameKeeper"

export class NameKeeperFactory {

    static create(env: Environment): Promise<NameKeeper> {
        const storage: NamingStorage = new NamingStorage(env.getBean(Bean.STORAGE))
        return NameKeeper.build(storage)
    }
}
