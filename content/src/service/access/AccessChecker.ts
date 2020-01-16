import { EthAddress } from "../auth/Authenticator";
import { EntityType, Pointer } from "../Entity";

export interface AccessChecker {

    hasAccess(entityType: EntityType, pointers: Pointer[], ethAddress: EthAddress): Promise<string[]>

}