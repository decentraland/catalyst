import Analytics from "analytics-node"
import { Entity } from "../Entity";
import { EthAddress } from "../auth/Authenticator";
import { ContentAnalytics } from "./ContentAnalytics";

export class ContentAnalyticsWithSegment implements ContentAnalytics {

    private segmentClient: Analytics;

    constructor(writeKey: string) {
        this.segmentClient = new Analytics(writeKey);
    }

    recordDeployment(serverName: string, entity: Entity, ethAddress: EthAddress, origin: string): void {
        this.segmentClient.track(
            ContentAnalyticsWithSegment.createRecordEvent(serverName, entity, ethAddress, origin),
            (err: Error, data: any) => {
                if (err) {
                    console.log("There was an error while reporting metrics: ", err)
                }
            })
	}

    static createRecordEvent(serverName: string, entity: Entity, ethAddress: EthAddress, origin: string): any {
        return {
            userId: ethAddress,
            event: 'Katalyst Content Upload',
            properties: {
                server: serverName,
                type: entity.type,
                cid: entity.id,
                pointers: entity.pointers,
                files: Array.from(entity.content?.entries()||[]).map(entry => {return {
                    path: entry[0],
                    cid: entry[1]
                }}),
                origin: origin,
            }
        }
	}

}