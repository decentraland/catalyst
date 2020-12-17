import { Bean, Environment, EnvironmentConfig } from '../../Environment'
import { MetaverseContentService } from '../Service'
import { SQSDeploymentReporter } from './SQSDeploymentReporter'

export class SQSDeploymentReporterFactory {
  static create(env: Environment): SQSDeploymentReporter {
    const service: MetaverseContentService = env.getBean(Bean.SERVICE)

    const sqsKey: string | undefined = env.getConfig(EnvironmentConfig.SQS_ACCESS_KEY_ID)
    const sqsSecret: string | undefined = env.getConfig(EnvironmentConfig.SQS_SECRET_ACCESS_KEY)
    const queueURL: string | undefined = env.getConfig(EnvironmentConfig.SQS_QUEUE_URL_REPORTING)

    return new SQSDeploymentReporter(service, sqsKey, sqsSecret, queueURL)
  }
}
