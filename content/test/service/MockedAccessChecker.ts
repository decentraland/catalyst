import { AccessChecker } from "../../src/service/AccessChecker";

export class MockedAccessChecker implements AccessChecker {

    hasParcellAccess(x: number, y: number, ethAddress: string): Promise<boolean> {
        return Promise.resolve(true);
    }

}