import { EntityType, Pointer } from "../Entity";
import { EthAddress } from "dcl-crypto";
import { Timestamp } from "../time/TimeSorting";

export interface AccessChecker {

    hasAccess(entityType: EntityType, pointers: Pointer[], timestamp: Timestamp, ethAddress: EthAddress): Promise<string[]>

}