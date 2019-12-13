import { Service } from "./Service";
import { Environment, Bean } from "../Environment";
import { ServiceImpl } from "./ServiceImpl";

export class ServiceFactory {
    static create(env: Environment): Service {
        return new ServiceImpl(env.getBean(Bean.STORAGE));
    }
}

