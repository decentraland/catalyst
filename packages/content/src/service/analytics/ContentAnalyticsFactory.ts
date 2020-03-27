import { Environment, EnvironmentConfig } from "../../Environment"
import { ContentAnalytics } from "./ContentAnalytics"
import { ContentAnalyticsWithSegment } from "./ContentAnalyticsWithSegment"
import { DummyContentAnalytics } from "./DummyContentAnalytics"

export class ContentAnalyticsFactory {

    static create(env: Environment): ContentAnalytics {
        if (env.getConfig(EnvironmentConfig.SEGMENT_WRITE_KEY)) {
            return new ContentAnalyticsWithSegment(env.getConfig(EnvironmentConfig.SEGMENT_WRITE_KEY))
        }
        return new DummyContentAnalytics()
    }
}