import { Entity } from "../Entity";
import { EthAddress } from "../Service";

export interface ContentAnalytics {

    recordDeployment(entity: Entity, ethAddress: EthAddress): void

}