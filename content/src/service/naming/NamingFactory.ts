import { Environment, Bean } from "../../Environment"
import { NamingStorage } from "./NamingStorage"
import { Naming } from "./Naming"

export class NamingFactory {

    static create(env: Environment): Promise<Naming> {
        const storage: NamingStorage = new NamingStorage(env.getBean(Bean.STORAGE))
        return Naming.build(storage)
    }
}
