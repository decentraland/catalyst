import { AccessChecker } from "@katalyst/content/service/access/AccessChecker";
import { EntityType, Pointer } from "@katalyst/content/service/Entity";
import { EthAddress } from "dcl-crypto";

export class MockedAccessChecker implements AccessChecker {

    hasAccess(entityType: EntityType, pointers: Pointer[], ethAddress: EthAddress): Promise<string[]> {
        return Promise.resolve([]);
    }

}