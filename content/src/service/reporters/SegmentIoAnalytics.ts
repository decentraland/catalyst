import Analytics from 'analytics-node'
import { Authenticator, EthAddress } from 'dcl-crypto'
import log4js from 'log4js'
import { Entity } from '../Entity'
import { MetaverseContentService } from '../Service'

export class SegmentIoAnalytics {
  private static readonly LOGGER = log4js.getLogger('ContentAnalyticsWithSegment')

  private segmentClient: Analytics

  constructor(segmentWriteKey: string | undefined, service: MetaverseContentService) {
    if (segmentWriteKey) {
      this.segmentClient = new Analytics(segmentWriteKey)
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
    this.segmentClient.track(SegmentIoAnalytics.createRecordEvent(entity, ethAddress, origin), (err: Error) => {
      if (err) {
        SegmentIoAnalytics.LOGGER.warn(`There was an error while reporting metrics: ${err.message}`)
      }
    })
  }

  private static createRecordEvent(entity: Entity, ethAddress: EthAddress, origin: string): any {
    return {
      userId: ethAddress,
      event: 'Catalyst Content Upload',
      properties: {
        type: entity.type,
        cid: entity.id,
        origin: origin
      }
    }
  }
}
