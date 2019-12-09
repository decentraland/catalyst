import { Service } from "./service";
import { MockedService } from "./MockedService";

export class ServiceFactory {
    static mock(): Service {
        return new MockedService();
    }
}

