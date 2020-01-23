import { Entity } from "../Entity";
import { ContentAnalytics } from "./ContentAnalytics";
import { ContentAnalyticsWithSegment } from "./ContentAnalyticsWithSegment";
import { EthAddress } from "../auth/Authenticator";

export class DummyContentAnalytics implements ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: EthAddress, origin: string): void {
        console.log("Analytics Deployment Record: ", JSON.stringify(ContentAnalyticsWithSegment.createRecordEvent(serverName, entity, ethAddress, origin)))
	}

}