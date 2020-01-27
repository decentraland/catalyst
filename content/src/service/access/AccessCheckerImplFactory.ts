import { Environment, Bean } from "@katalyst/content/Environment";
import { AccessCheckerImpl } from "./AccessCheckerImpl";

export class AccessCheckerImplFactory {
    static create(env: Environment): AccessCheckerImpl {
        return new AccessCheckerImpl(env.getBean(Bean.AUTHENTICATOR))
    }
}
