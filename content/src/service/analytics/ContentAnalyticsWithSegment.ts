import Analytics from "analytics-node"
import { Entity } from "../Entity";
import { EthAddress } from "../Service";
import { ContentAnalytics } from "./ContentAnalytics";

export class ContentAnalyticsWithSegment implements ContentAnalytics {

    private segmentClient: Analytics;

    constructor(writeKey: string) {
        this.segmentClient = new Analytics(writeKey);
    }

    recordDeployment(entity: Entity, ethAddress: EthAddress): void {
        this.segmentClient.track(ContentAnalyticsWithSegment.createRecordEvent(entity, ethAddress))
	}

    static createRecordEvent(entity: Entity, ethAddress: EthAddress): any {
        return {
            userId: ethAddress,
            event: 'Content Upload',
            properties: {
                cid: entity.id,
                parcels: entity.pointers,
                files: entity.content,
                origin: "",
            }
        }
	}

}