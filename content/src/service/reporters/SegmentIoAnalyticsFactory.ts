import { Environment, Bean } from "../../Environment"
import { DeploymentReporter } from "./DeploymentReporter"
import { MetaverseContentService } from '../Service';
import { SegmentIoAnalytics } from "./SegmentIoAnalytics";

export class SegmentIoAnalyticsFactory {

    static create(env: Environment): DeploymentReporter {

        const service: MetaverseContentService = env.getBean(Bean.SERVICE)

        return new SegmentIoAnalytics(env, service)
    }
}
