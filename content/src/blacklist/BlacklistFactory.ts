import { Environment, Bean } from "../Environment";
import { Blacklist } from "./Blacklist";
import { BlacklistStorage } from "./BlacklistStorage";

export class BlacklistFactory {
    static create(env: Environment): Blacklist {
        return new Blacklist(new BlacklistStorage(env.getBean(Bean.STORAGE)), env.getBean(Bean.AUTHENTICATOR))
    }
}