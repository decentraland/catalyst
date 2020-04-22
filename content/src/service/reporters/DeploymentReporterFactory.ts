import { Environment, EnvironmentConfig } from "../../Environment"
import { DeploymentReporter } from "./DeploymentReporter"
import { SegmentIoAnalytics } from "./SegmentIoAnalytics"
import { NoOpDeploymentReporter } from "./NoOpDeploymentReporter"
import { SQSDeploymentReporter } from "./SQSDeploymentReporter"
import { CompositeDeploymentReporter } from "./CompositeDeploymentReporter"

export class DeploymentReporterFactory {

    static create(env: Environment): DeploymentReporter {
        let reporters: DeploymentReporter[] = []

        if (env.getConfig(EnvironmentConfig.SQS_QUEUE_URL_REPORTING)) {
            reporters.push(new SQSDeploymentReporter(
                env.getConfig(EnvironmentConfig.SQS_ACCESS_KEY_ID),
                env.getConfig(EnvironmentConfig.SQS_SECRET_ACCESS_KEY),
                env.getConfig(EnvironmentConfig.SQS_QUEUE_URL_REPORTING)))
        }

        if (env.getConfig(EnvironmentConfig.SEGMENT_WRITE_KEY)) {
            reporters.push(new SegmentIoAnalytics(env.getConfig(EnvironmentConfig.SEGMENT_WRITE_KEY)))
        }

        if (reporters.length > 0) {
            return new CompositeDeploymentReporter(reporters)
        }
        return new NoOpDeploymentReporter()
    }
}