import { Entity } from "../Entity";
import { EthAddress } from "../Service";
import { ContentAnalytics } from "./ContentAnalytics";
import { ContentAnalyticsWithSegment } from "./ContentAnalyticsWithSegment";

export class DummyContentAnalytics implements ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: EthAddress): void {
        console.log("Analytics Deployment Record: ", JSON.stringify(ContentAnalyticsWithSegment.createRecordEvent(entity, ethAddress, serverName)))
	}

}