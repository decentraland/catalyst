import { EntityType, Pointer } from "../Entity";
import { EthAddress } from "decentraland-crypto/types";

export interface AccessChecker {

    hasAccess(entityType: EntityType, pointers: Pointer[], ethAddress: EthAddress): Promise<string[]>

}