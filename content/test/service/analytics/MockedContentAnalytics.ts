import { ContentAnalytics } from "../../../src/service/analytics/ContentAnalytics";
import { Entity } from "../../../src/service/Entity";
import { ContentAnalyticsWithSegment } from "../../../src/service/analytics/ContentAnalyticsWithSegment";

export class MockedContentAnalytics implements ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: string): void {
        console.log("MockContentAnalytics: ", ContentAnalyticsWithSegment.createRecordEvent(entity, ethAddress, serverName))
    }

}