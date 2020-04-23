import { Entity } from "../Entity";
import { DeploymentReporter } from "./DeploymentReporter";
import { EthAddress } from "dcl-crypto";

export class CompositeDeploymentReporter implements DeploymentReporter {

    constructor(private readonly reporters: DeploymentReporter[]) { }

    reportDeployment(entity: Entity, ethAddress: EthAddress, origin: string): void {
        this.reporters.forEach(reporter => reporter.reportDeployment(entity, ethAddress, origin))
	}

}