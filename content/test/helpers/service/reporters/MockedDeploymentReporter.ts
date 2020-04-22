import { DeploymentReporter } from "@katalyst/content/service/reporters/DeploymentReporter";
import { Entity } from "@katalyst/content/service/Entity";
import { SegmentIoAnalytics } from "@katalyst/content/service/reporters/SegmentIoAnalytics";

export class MockedDeploymentReporter implements DeploymentReporter {

    reportDeployment(entity: Entity, ethAddress: string, origin: string): void {
        console.log("MockContentAnalytics: ", SegmentIoAnalytics.createRecordEvent(entity, ethAddress, origin))
    }

}