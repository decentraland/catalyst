import { Entity } from "../Entity";
import { EthAddress } from "../Service";
import { ContentAnalytics } from "./ContentAnalytics";

export class DummyContentAnalytics implements ContentAnalytics {

    recordDeployment(entity: Entity, ethAddress: EthAddress): void {
        // Do nothing
	}

}