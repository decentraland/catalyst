import { EntityType, Pointer } from "../Entity";
import { EthAddress } from "dcl-crypto";

export interface AccessChecker {

    hasAccess(entityType: EntityType, pointers: Pointer[], ethAddress: EthAddress): Promise<string[]>

}