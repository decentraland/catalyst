import { Entity } from "../Entity";
import { EthAddress } from "dcl-crypto";

export interface DeploymentReporter {

    reportDeployment(entity: Entity, ethAddress: EthAddress, origin: string): void

}