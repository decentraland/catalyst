import { Environment, Bean } from "../Environment";
import { Controller } from "./Controller";

export class ControllerFactory {
    static create(env: Environment): Controller {
        return new Controller(env.getBean(Bean.SERVICE), env.getBean(Bean.HISTORY_MANAGER));
    }
}