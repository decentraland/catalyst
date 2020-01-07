import { Environment, Bean } from "../Environment";
import { Controller } from "./Controller";
import { BlacklistServiceDecorator } from "../blacklist/BlacklistServiceDecorator";
import { Blacklist } from "../blacklist/Blacklist";
import { MetaverseContentService } from "../service/Service";

export class ControllerFactory {
    static create(env: Environment): Controller {
        const service: MetaverseContentService = env.getBean(Bean.SERVICE);
        const blacklist: Blacklist = env.getBean(Bean.BLACKLIST);
        return new Controller(new BlacklistServiceDecorator(service, blacklist), env.getBean(Bean.HISTORY_MANAGER), blacklist);
    }
}