import { Entity } from "../Entity";
import { EthAddress } from "dcl-crypto";

export interface ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: EthAddress, origin: string): void

}