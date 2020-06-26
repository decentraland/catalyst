import { Transform } from 'stream'
import { DeploymentWithAuditInfo, EntityId } from 'dcl-catalyst-commons';

/**
 * Expose a stream transform that filters out already deployed entities.
 * We will use a buffer to accumulate a number of deployments, and when the number is reached, we
 * check which of those deployments is new.
 */
export class OnlyNotDeployedFilter extends Transform {

    private static readonly BUFFERED_DEPLOYMENTS = 300
    private readonly buffer: DeploymentWithAuditInfo[] = []

    constructor(private readonly checkIfAlreadyDeployed: (entityIds: EntityId[]) => Promise<Map<EntityId, boolean>>,) {
        super({ objectMode: true })
    }

    async _transform(deployment: DeploymentWithAuditInfo, _, done) {
        this.buffer.push(deployment)
        if (this.buffer.length >= OnlyNotDeployedFilter.BUFFERED_DEPLOYMENTS) {
             await this.processBufferAndPushNonDeployed()
        }
        done()
    }

    async _flush(done) {
        if (this.buffer.length > 0) {
            await this.processBufferAndPushNonDeployed()
        }
        done()
    }

    private async processBufferAndPushNonDeployed(): Promise<void> {
        // Find non deployed entities
        const ids = this.buffer.map(({ entityId }) => entityId)
        const deployInfo = await this.checkIfAlreadyDeployed(ids)
        const newEntities: Set<EntityId> = new Set(Array.from(deployInfo.entries())
            .filter(([, deployed]) => !deployed)
            .map(([entityId]) => entityId))

        // Filter out already deployed entities and push the new ones
        this.buffer.filter(event => newEntities.has(event.entityId))
            .forEach(deployment => this.push(deployment))

        // Clear the buffer
        this.buffer.length = 0
    }
}