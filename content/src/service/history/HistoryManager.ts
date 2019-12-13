import { Timestamp } from "../Service"
import { EntityType, EntityId, Entity } from "../Entity"

export interface HistoryManager {
    newEntityDeployment(entity: Entity, deploymentTimestamp: Timestamp): void;
    setTimeAsImmutable(immutableTime: Timestamp): Promise<void>;
    getHistory(from?: Timestamp, to?: Timestamp): Promise<DeploymentHistory>;
}

export type DeploymentEvent = {
    entityType: EntityType,
    entityId: EntityId,
    timestamp: Timestamp,
}

export type DeploymentHistory = DeploymentEvent[]