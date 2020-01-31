import { FailedDeployment, FailureReason } from "./FailedDeploymentsManager";
import { EntityType } from "../Entity";

export class FailedDeploymentsSerializer {

    private static EVENT_SEPARATOR: string = '\n'
    private static ATTRIBUTES_SEPARATOR: string = ' '

    static unserializeFailedDeployments(buffer: Buffer): FailedDeployment[] {
        const serializedHistory: string = buffer.toString().trimEnd()
        if (serializedHistory.includes(FailedDeploymentsSerializer.ATTRIBUTES_SEPARATOR)) {
            return serializedHistory.split(FailedDeploymentsSerializer.EVENT_SEPARATOR)
                .map(FailedDeploymentsSerializer.unserialize)
        } else {
            return []
        }
    }

    static serializeFailedDeployments(failedDeployments: FailedDeployment[]): Buffer {
        let serializedDeployments: string = failedDeployments.map(FailedDeploymentsSerializer.serialize).join(FailedDeploymentsSerializer.EVENT_SEPARATOR)
        if (failedDeployments.length > 0) {
            serializedDeployments += FailedDeploymentsSerializer.EVENT_SEPARATOR
        }
        return Buffer.from(serializedDeployments)
    }

    static serialize(failedDeployment: FailedDeployment): string {
        return [failedDeployment.reason.replace(' ', '_').toLocaleUpperCase(), failedDeployment.moment, failedDeployment.deployment.serverName, failedDeployment.deployment.entityType, failedDeployment.deployment.entityId, failedDeployment.deployment.timestamp]
            .join(FailedDeploymentsSerializer.ATTRIBUTES_SEPARATOR)
    }

    private static unserialize(serializedEvent: string): FailedDeployment {
        const parts: string[] = serializedEvent.split(FailedDeploymentsSerializer.ATTRIBUTES_SEPARATOR)
        const [reason, moment, serverName, entityType, entityId, timestamp] = parts
        return {
            reason: FailureReason[reason],
            moment: parseInt(moment),
            deployment: {
                serverName,
                entityType: EntityType[entityType.toUpperCase().trim()],
                entityId: entityId,
                timestamp: parseInt(timestamp),
            },
        }
    }

}