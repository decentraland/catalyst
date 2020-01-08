import { ContentAnalytics } from "@katalyst/content/service/analytics/ContentAnalytics";
import { Entity } from "@katalyst/content/service/Entity";
import { ContentAnalyticsWithSegment } from "@katalyst/content/service/analytics/ContentAnalyticsWithSegment";

export class MockedContentAnalytics implements ContentAnalytics {

    recordDeployment(serverName: string, entity: Entity, ethAddress: string): void {
        console.log("MockContentAnalytics: ", ContentAnalyticsWithSegment.createRecordEvent(serverName, entity, ethAddress))
    }

}