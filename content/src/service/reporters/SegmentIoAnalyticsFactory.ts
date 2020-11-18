import { Environment, Bean, EnvironmentConfig } from "../../Environment"
import { MetaverseContentService } from '../Service';
import { SegmentIoAnalytics } from "./SegmentIoAnalytics";

export class SegmentIoAnalyticsFactory {

    static create(env: Environment): SegmentIoAnalytics {

        const service: MetaverseContentService = env.getBean(Bean.SERVICE)

        return new SegmentIoAnalytics(env.getConfig(EnvironmentConfig.SEGMENT_WRITE_KEY), service)
    }
}
