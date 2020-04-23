import log4js from "log4js"
import { Entity } from "../Entity";
import { DeploymentReporter } from "./DeploymentReporter";
import { EthAddress } from "dcl-crypto";

export class NoOpDeploymentReporter implements DeploymentReporter {

    private static readonly LOGGER = log4js.getLogger('NoOpDeploymentReporter');

    reportDeployment(entity: Entity, ethAddress: EthAddress, origin: string): void {
        NoOpDeploymentReporter.LOGGER.debug(this.createLogLine(entity, ethAddress, origin))
	}

    private createLogLine(entity: Entity, ethAddress: EthAddress, origin: string) {
        return `Deployment. Entity: ${entity.id}.`
    }
}