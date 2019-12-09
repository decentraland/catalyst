import { Service } from "./Service";
import { MockedService } from "./MockedService";

export class ServiceFactory {
    static mock(): Service {
        return new MockedService();
    }
}

