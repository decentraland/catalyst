import { Environment, Bean } from "../Environment";
import { ServiceStorage } from "./ServiceStorage";

export class ServiceStorageFactory {
    static create(env: Environment): ServiceStorage {
        return new ServiceStorage(env.getBean(Bean.STORAGE));
    }
}

