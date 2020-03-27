import log4js from "log4js"
import { Entity } from "../Entity";
import { ContentAnalytics } from "./ContentAnalytics";
import { EthAddress } from "dcl-crypto";

export class DummyContentAnalytics implements ContentAnalytics {

    private static readonly LOGGER = log4js.getLogger('DummyContentAnalytics');

    recordDeployment(serverName: string, entity: Entity, ethAddress: EthAddress, origin: string): void {
        DummyContentAnalytics.LOGGER.debug(this.createLogLine(serverName, entity, ethAddress, origin))
	}

    private createLogLine(serverName: string, entity: Entity, ethAddress: EthAddress, origin: string) {
        return `Deployment. Server: ${serverName}. Entity: ${entity.id}.`
    }
}