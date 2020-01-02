import { Entity } from "../Entity";
import { EthAddress } from "../auth/Authenticator";

export interface ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: EthAddress): void

}