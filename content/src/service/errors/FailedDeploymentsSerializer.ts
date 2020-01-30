import { FailedDeployment, DeploymentStatus } from "./FailedDeploymentsManager";
import { streamMap, streamFilter, StreamPipeline } from "@katalyst/content/helpers/StreamHelper";
import { EntityType } from "../Entity";

export class FailedDeploymentsSerializer {

    private static ATTRIBUTES_SEPARATOR: string = ' '

    static addUnserialization(pipeline: StreamPipeline) {
        const filter = streamFilter((serializedFailedDeployment: string) => serializedFailedDeployment.length > 0)
        const map = streamMap((serializedFailedDeployment: string) => FailedDeploymentsSerializer.unserialize(serializedFailedDeployment))
        return pipeline.add(filter)
            .add(map)
    }

    static serializeStream() {
        return streamMap((failedDeployment: FailedDeployment) => FailedDeploymentsSerializer.serialize(failedDeployment))
    }

    private static unserialize(serializedEvent: string | Buffer): FailedDeployment {
        const stringEvent: string = (serializedEvent instanceof Buffer) ? serializedEvent.toString() : serializedEvent
        const parts: string[] = stringEvent.split(FailedDeploymentsSerializer.ATTRIBUTES_SEPARATOR)
        const [status, serverName, entityType, entityId, timestamp] = parts
        return {
            status: DeploymentStatus[status],
            deployment: {
                serverName,
                entityType: EntityType[entityType.toUpperCase().trim()],
                entityId: entityId,
                timestamp: parseInt(timestamp),
            }
        }
    }

    static serialize(failedDeployment: FailedDeployment): string {
        const { status, deployment } = failedDeployment
        return [status.replace(" ", "_").toLocaleUpperCase(), deployment.serverName, deployment.entityType, deployment.entityId, deployment.timestamp]
            .join(FailedDeploymentsSerializer.ATTRIBUTES_SEPARATOR)
    }

}