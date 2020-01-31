import { FileSystemContentStorage } from "@katalyst/content/storage/FileSystemContentStorage";
import { EntityType, EntityId } from "@katalyst/content/service/Entity";
import { FailedDeployment } from "./FailedDeploymentsManager";
import { FailedDeploymentsSerializer } from "./FailedDeploymentsSerializer";


export class FailedDeploymentsStorage {

    private static CATEGORY: string = "failed"
    private static ID: string = "deployments.log"

    constructor(private readonly storage: FileSystemContentStorage) { }

    addFailedDeployment(failedDeployment: FailedDeployment): Promise<void> {
        return this.storage.store(FailedDeploymentsStorage.CATEGORY, FailedDeploymentsStorage.ID, Buffer.from(FailedDeploymentsSerializer.serialize(failedDeployment) + '\n'), true)
    }

    /** Returned from latest, to oldest */
    async getAllFailedDeployments(): Promise<FailedDeployment[]>{
        const contentItem = await this.storage.getContent(FailedDeploymentsStorage.CATEGORY, FailedDeploymentsStorage.ID);
        if (contentItem) {
            const buffer = await contentItem.asBuffer()
            return FailedDeploymentsSerializer.unserializeFailedDeployments(buffer).reverse()
        } else {
            return []
        }
    }

    async deleteDeploymentEventIfPresent(entityType: EntityType, entityId: EntityId): Promise<void> {
        const failedDeployments = await this.getAllFailedDeployments();
        const filtered = failedDeployments.filter((failedDeployment: FailedDeployment) => failedDeployment.deployment.entityType !== entityType || failedDeployment.deployment.entityId !== entityId)
        const buffer = FailedDeploymentsSerializer.serializeFailedDeployments(filtered)
        return this.storage.store(FailedDeploymentsStorage.CATEGORY, FailedDeploymentsStorage.ID, buffer)
    }
}