import { AccessChecker } from "@katalyst/content/service/access/AccessChecker";
import { EntityType, Pointer } from "@katalyst/content/service/Entity";
import { EthAddress } from "dcl-crypto";
import { Timestamp } from "@katalyst/content/service/time/TimeSorting";

export class MockedAccessChecker implements AccessChecker {

    private returnErrors: boolean = false

    hasAccess(entityType: EntityType, pointers: Pointer[], timestamp: Timestamp, ethAddress: EthAddress): Promise<string[]> {
        if (this.returnErrors) {
            return Promise.resolve(['Some errors']);
        } else {
            return Promise.resolve([]);
        }
    }

    startReturningErrors() {
        this.returnErrors = true
    }

    stopReturningErrors() {
        this.returnErrors = false
    }

}