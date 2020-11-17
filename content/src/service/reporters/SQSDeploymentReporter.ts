import log4js from "log4js";
import { EntityType } from "dcl-catalyst-commons";
import { Entity } from "../Entity";
import { DeploymentReporter } from "./DeploymentReporter";
import { Authenticator, EthAddress } from "dcl-crypto";
import SQS, { SendMessageRequest } from "aws-sdk/clients/sqs";
import { AWSError, Credentials } from "aws-sdk";
import { Environment, EnvironmentConfig } from "../../Environment";
import { DeploymentEvent, MetaverseContentService } from '../Service';

export class SQSDeploymentReporter implements DeploymentReporter {

    private static readonly LOGGER = log4js.getLogger('SQSDeploymentReporter');

    private sqsClient: SQS;
    private queueURL: string;

    constructor(
        env: Environment,
        service: MetaverseContentService,
        private readonly callback?: (error?: string, messageId?: string) => void) {

        const sqsKey: string = env.getConfig(EnvironmentConfig.SQS_ACCESS_KEY_ID)
        const sqsSecret: string = env.getConfig(EnvironmentConfig.SQS_SECRET_ACCESS_KEY)
        this.queueURL = env.getConfig(EnvironmentConfig.SQS_QUEUE_URL_REPORTING)

        if (sqsKey && sqsSecret && this.queueURL) {
            this.sqsClient = new SQS({
                region: "us-east-1",
                credentials: new Credentials(sqsKey, sqsSecret)
            })
            service.listenToDeployments((deployment) => this.onDeployment(deployment))
        }

    }


    private async onDeployment(deploymentEvent: DeploymentEvent): Promise<void> {
        this.reportDeployment(deploymentEvent.entity,
            Authenticator.ownerAddress(deploymentEvent.auditInfo.authChain),
            deploymentEvent.origin)
    }


    reportDeployment(entity: Entity, ethAddress: EthAddress, origin: string): void {
        if (entity.type !== EntityType.SCENE) {
            // Only send SCENE notifications to SQS
            return
        }
        const messageBody = {
            type: entity.type,
            id: entity.id,
        }
        const messageRequest: SendMessageRequest = {
            QueueUrl: this.queueURL,
            MessageBody: JSON.stringify(messageBody),
        }
        try {
            this.sqsClient.sendMessage(messageRequest, (err: AWSError, data: SQS.Types.SendMessageResult) => {
                if (err) {
                    SQSDeploymentReporter.LOGGER.error("Error sending SQS message.", err)
                } else {
                    SQSDeploymentReporter.LOGGER.debug("SQS message sent OK. MessageId: " + data.MessageId)
                }
                if (this.callback) {
                    this.callback(err?.message, data?.MessageId)
                }
            })
        } catch (error) {
            SQSDeploymentReporter.LOGGER.error("Error while calling SQS API.", error)
        }
    }

}