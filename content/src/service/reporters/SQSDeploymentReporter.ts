import log4js from "log4js";
import { Entity, EntityType } from "../Entity";
import { DeploymentReporter } from "./DeploymentReporter";
import { EthAddress } from "dcl-crypto";
import SQS, { SendMessageRequest } from "aws-sdk/clients/sqs";
import { AWSError, Credentials } from "aws-sdk";

export class SQSDeploymentReporter implements DeploymentReporter {

    private static readonly LOGGER = log4js.getLogger('SQSDeploymentReporter');

    private sqsClient: SQS;

    constructor(
        accessKeyId: string,
        secretAccessKey,
        private readonly queueURL: string,
        private readonly callback?: (error?:string, messageId?:string) => void) {

        this.sqsClient = new SQS({
            region: "us-east-1",
            credentials: new Credentials(accessKeyId, secretAccessKey)})
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