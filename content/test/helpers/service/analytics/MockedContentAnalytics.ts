import { ContentAnalytics } from "@katalyst/content/src/service/analytics/ContentAnalytics";
import { Entity } from "@katalyst/content/src/service/Entity";
import { ContentAnalyticsWithSegment } from "@katalyst/content/src/service/analytics/ContentAnalyticsWithSegment";

export class MockedContentAnalytics implements ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: string): void {
        console.log("MockContentAnalytics: ", ContentAnalyticsWithSegment.createRecordEvent(serverName, entity, ethAddress))
    }

}