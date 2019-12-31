import { AccessChecker } from "../../../src/service/access/AccessChecker";

export class MockedAccessChecker implements AccessChecker {

    hasParcelAccess(x: number, y: number, ethAddress: string): Promise<boolean> {
        return Promise.resolve(true);
    }

}