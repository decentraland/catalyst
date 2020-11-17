import { Environment, Bean } from "../../Environment"
import { DeploymentReporter } from "./DeploymentReporter"
import { SQSDeploymentReporter } from "./SQSDeploymentReporter"
import { MetaverseContentService } from '../Service';

export class SQSDeploymentReporterFactory {

    static create(env: Environment): DeploymentReporter {

        const service: MetaverseContentService = env.getBean(Bean.SERVICE)

        return new SQSDeploymentReporter(env, service)
    }
}
