import { Environment, Bean, DEBUG_NAME } from "../../Environment"
import { NamingStorage } from "./NamingStorage"
import { NameKeeper } from "./NameKeeper"

export class NameKeeperFactory {

    static create(env: Environment): Promise<NameKeeper> {
        // TODO: remove this before final release
        if (env.getConfig(DEBUG_NAME)) {
            return Promise.resolve(new NameKeeper(env.getConfig(DEBUG_NAME)))
        }

        const storage: NamingStorage = new NamingStorage(env.getBean(Bean.STORAGE))
        return NameKeeper.build(storage)
    }
}
