import { Timestamp } from "../Service"
import { EntityType, EntityId, Pointer, Entity } from "../Entity"
import { FileHash } from "../Hashing"

export interface HistoryManager {
    newEntityDeployment(entity: Entity): void;
    getHistory(from?: Timestamp, to?: Timestamp, type?: HistoryType): Promise<HistoryEvent[]>;
}

export abstract class HistoryEvent {

    timestamp: Timestamp
    type: HistoryType

    constructor(type: HistoryType, timestamp: Timestamp) {
        this.type = type
        this.timestamp = timestamp
    }
}

export class DeploymentEvent extends HistoryEvent {
    entityType: EntityType
    entityId: EntityId

    constructor(entityType: EntityType, entityId: EntityId, timestamp: Timestamp) {
        super(HistoryType.DEPLOYMENT, timestamp)
        this.entityType = entityType
        this.entityId = entityId
    }
}

export class SnapshotEvent extends HistoryEvent {
    activeEntities: Map<EntityType, Map<Pointer, EntityId>>
    deltaEventsHash: FileHash
    previousSnapshotTimestamp: Timestamp

    constructor(timestamp: Timestamp) {
        super(HistoryType.SNAPSHOT, timestamp)
    }
}

export enum HistoryType {
    DEPLOYMENT = "deployment",
    SNAPSHOT   = "snapshot",
}
