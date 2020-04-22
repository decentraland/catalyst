import log4js from "log4js";
import { Entity } from "../Entity";
import { DeploymentReporter } from "./DeploymentReporter";
import { EthAddress } from "dcl-crypto";
import SQS, { SendMessageRequest } from "aws-sdk/clients/sqs";
import { AWSError } from "aws-sdk";

export class SQSDeploymentReporter implements DeploymentReporter {

    private static readonly LOGGER = log4js.getLogger('SQSDeploymentReporter');

    private sqsClient: SQS;

    constructor(private readonly queueURL: string) {
        this.sqsClient = new SQS()
    }

    reportDeployment(entity: Entity, ethAddress: EthAddress, origin: string): void {
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
            })
        } catch (error) {
            SQSDeploymentReporter.LOGGER.error("Error while calling SQS API.", error)
        }
    }

}