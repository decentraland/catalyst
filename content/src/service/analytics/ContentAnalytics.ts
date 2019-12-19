import { Entity } from "../Entity";
import { EthAddress } from "../Service";

export interface ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: EthAddress): void

}