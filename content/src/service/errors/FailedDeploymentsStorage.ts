// import { LineStream } from "byline"
import { StreamPipeline, streamFilter, streamMap } from "@katalyst/content/helpers/StreamHelper";
import { FileSystemContentStorage } from "@katalyst/content/storage/FileSystemContentStorage";
import { EntityType, EntityId } from "../Entity";
import { FailedDeployment } from "./FailedDeploymentsManager";
import { FailedDeploymentsSerializer } from "./FailedDeploymentsSerializer";


export class FailedDeploymentsStorage {

    private static CATEGORY: string = "failed"
    private static ID: string = "deployments.log"

    constructor(private readonly storage: FileSystemContentStorage) { }

    addFailedDeployment(failedDeployment: FailedDeployment): Promise<void> {
        return this.storage.store(FailedDeploymentsStorage.CATEGORY, FailedDeploymentsStorage.ID, Buffer.from(FailedDeploymentsSerializer.serialize(failedDeployment) + '\n'), true)
    }

    getAllFailedDeployments(): StreamPipeline {
        const pipeline = new StreamPipeline(this.storage.readStreamBackwards(FailedDeploymentsStorage.CATEGORY, FailedDeploymentsStorage.ID))
        return FailedDeploymentsSerializer.addUnserialization(pipeline)
    }

    deleteDeploymentEventIfPresent(entityType: EntityType, entityId: EntityId): Promise<void> {
        return this.getAllFailedDeployments()
            .add(streamFilter((failedDeployment: FailedDeployment) => failedDeployment.deployment.entityType != entityType || failedDeployment.deployment.entityId == entityId))
            .add(FailedDeploymentsSerializer.serializeStream())
            .add(streamMap(serializedEvent => serializedEvent + '\n'))
            .addAndExecute(this.storage.writeStream(FailedDeploymentsStorage.CATEGORY, FailedDeploymentsStorage.ID))
    }
}