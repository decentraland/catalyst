import { AWSError, Credentials } from 'aws-sdk'
import SQS, { SendMessageRequest } from 'aws-sdk/clients/sqs'
import { EntityType } from 'dcl-catalyst-commons'
import { Authenticator, EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { Entity } from '../Entity'
import { MetaverseContentService } from '../Service'

export class SQSDeploymentReporter {
  private static readonly LOGGER = log4js.getLogger('SQSDeploymentReporter')

  private sqsClient: SQS
  private queueURL: string

  constructor(
    service: MetaverseContentService,
    sqsKey: string | undefined,
    sqsSecret: string | undefined,
    queueURL: string | undefined,
    private readonly callback?: (error?: string, messageId?: string) => void
  ) {
    if (sqsKey && sqsSecret && queueURL) {
      this.queueURL = queueURL
      this.sqsClient = new SQS({
        region: 'us-east-1',
        credentials: new Credentials(sqsKey, sqsSecret)
      })
      service.listenToDeployments((deployment) =>
        this.reportDeployment(
          deployment.entity,
          Authenticator.ownerAddress(deployment.auditInfo.authChain),
          deployment.origin
        )
      )
    }
  }

  private reportDeployment(entity: Entity, ethAddress: EthAddress, origin: string): void {
    if (entity.type !== EntityType.SCENE) {
      // Only send SCENE notifications to SQS
      return
    }
    const messageBody = {
      type: entity.type,
      id: entity.id
    }
    const messageRequest: SendMessageRequest = {
      QueueUrl: this.queueURL,
      MessageBody: JSON.stringify(messageBody)
    }
    try {
      this.sqsClient.sendMessage(messageRequest, (err: AWSError, data: SQS.Types.SendMessageResult) => {
        if (err) {
          SQSDeploymentReporter.LOGGER.error('Error sending SQS message.', err)
        } else {
          SQSDeploymentReporter.LOGGER.debug('SQS message sent OK. MessageId: ' + data.MessageId)
        }
        if (this.callback) {
          this.callback(err?.message, data?.MessageId)
        }
      })
    } catch (error) {
      SQSDeploymentReporter.LOGGER.error('Error while calling SQS API.', error)
    }
  }
}
