import { Environment } from "../Environment";
import { ServiceImpl } from "./ServiceImpl";
import { LambdasService } from "./Service";

export class ServiceFactory {
    static create(env: Environment): LambdasService {
        return new ServiceImpl();
    }
}

