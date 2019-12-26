import { LambdasService, ServerStatus } from "./Service";

export class ServiceImpl implements LambdasService {

    getStatus(): Promise<ServerStatus> {
        return Promise.resolve({
            version: "1.0",
            currentTime: Date.now(),
        })
    }

}
