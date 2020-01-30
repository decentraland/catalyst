import { Entity } from "../Entity";
import { ContentAnalytics } from "./ContentAnalytics";
import { EthAddress } from "dcl-crypto";

export class DummyContentAnalytics implements ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: EthAddress, origin: string): void {
        console.info(this.createLogLine(serverName, entity, ethAddress, origin))
	}

    private createLogLine(serverName: string, entity: Entity, ethAddress: EthAddress, origin: string) {
        return `Deployment. Server: ${serverName}. Entity: ${entity.id}.`
    }
}