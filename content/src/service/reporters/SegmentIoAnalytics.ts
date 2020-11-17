import log4js from "log4js"
import Analytics from "analytics-node"
import { Entity } from "../Entity";
import { DeploymentReporter } from "./DeploymentReporter";
import { Authenticator, EthAddress } from "dcl-crypto";
import { DeploymentEvent, MetaverseContentService } from "../Service";
import { Environment, EnvironmentConfig } from "../../Environment";

export class SegmentIoAnalytics implements DeploymentReporter {

    private static readonly LOGGER = log4js.getLogger('ContentAnalyticsWithSegment');

    private segmentClient: Analytics;

    constructor(
        env: Environment,
        service: MetaverseContentService) {

            let segmentWriteKey: string = env.getConfig(EnvironmentConfig.SEGMENT_WRITE_KEY)
            if (segmentWriteKey) {
                this.segmentClient = new Analytics(segmentWriteKey);
                service.listenToDeployments((deployment) => this.onDeployment(deployment));
            }
    }


    private async onDeployment(deploymentEvent: DeploymentEvent): Promise<void> {
        this.reportDeployment(deploymentEvent.entity,
            Authenticator.ownerAddress(deploymentEvent.auditInfo.authChain),
            deploymentEvent.origin)
    }

    reportDeployment(entity: Entity, ethAddress: EthAddress, origin: string): void {
        this.segmentClient.track(
            SegmentIoAnalytics.createRecordEvent(entity, ethAddress, origin),
            (err: Error, data: any) => {
                if (err) {
                    SegmentIoAnalytics.LOGGER.warn(`There was an error while reporting metrics: ${err.message}`)
                }
            })
    }


    static createRecordEvent(entity: Entity, ethAddress: EthAddress, origin: string): any {
        return {
            userId: ethAddress,
            event: 'Catalyst Content Upload',
            properties: {
                type: entity.type,
                cid: entity.id,
                pointers: entity.pointers,
                files: Array.from(entity.content?.entries() || []).map(entry => {
                    return {
                        path: entry[0],
                        cid: entry[1]
                    }
                }),
                origin: origin,
            }
        }
    }

}