import { Entity } from "../Entity";
import { EthAddress } from "decentraland-crypto/types";

export interface ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: EthAddress, origin: string): void

}